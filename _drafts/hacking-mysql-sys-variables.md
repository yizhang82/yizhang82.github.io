

## Executing the command

The parser handles simple SET variable=value here:

```
internal_variable_name:
          ident
          {
            THD *thd= YYTHD;
            LEX *lex= thd->lex;
            sp_pcontext *pctx= lex->get_sp_current_parsing_ctx();
            sp_variable *spv;

            /* Best effort lookup for system variable. */
            if (!pctx || !(spv= pctx->find_variable($1, false)))
            {
              struct sys_var_with_base tmp= {NULL, $1};

              /* Not an SP local variable */
              if (find_sys_var_null_base(thd, &tmp))
                MYSQL_YYABORT;

              $$= tmp;
            }

```

```
// Option values with preceeding option_type.
option_value_following_option_type:
          internal_variable_name equal set_expr_or_default
          {
            THD *thd= YYTHD;
            LEX *lex= Lex;

            if ($1.var && $1.var != trg_new_row_fake_var)
            {
              /* It is a system variable. */
              $1.var->thd_id = Lex->thread_id_opt;
              if (set_system_variable(thd, &$1, lex->option_type, $3))
                MYSQL_YYABORT;
            }
            else
            {
              /*
                Not in trigger assigning value to new row,
                and option_type preceeding local variable is illegal.
              */
              my_parse_error(ER(ER_SYNTAX_ERROR));
              MYSQL_YYABORT;
            }
          }
        ;
```

set_expr_or_default are expanded to an Item-based AST just like any other expressions in SQL. We are not going to discuss this further now as this is a rather complicated topic and we'll cover it in later articles. For now, just know that MySQL defines a lot of Item-derived subclasses that represents value and operators, and an AST of those subclass instances represents the expression itself - pretty standard compiler stuff. The expression eventually can be evaluated into a value that we are going to "SET" into the variable. 

> We'll be discussing `Item` more extensively when we are looking at SELECT statements. 

```
set_expr_or_default:
          expr { $$=$1; }
        | DEFAULT { $$=0; }
        | ON
          {
            $$=new (YYTHD->mem_root) Item_string("ON",  2, system_charset_info);
            if ($$ == NULL)
              MYSQL_YYABORT;
          }
        | ALL
          {
            $$=new (YYTHD->mem_root) Item_string("ALL", 3, system_charset_info);
            if ($$ == NULL)
              MYSQL_YYABORT;
          }
        | BINARY
          {
            $$=new (YYTHD->mem_root) Item_string("binary", 6, system_charset_info);
            if ($$ == NULL)
              MYSQL_YYABORT;
          }
        ;


```

`set_system_variable` would create a `set_var` object and add it to the list. `set_var` represents the set statement itself. Let's discuss the set_var structure next.

## set_var object

`set_var` represents the SET statement itself (or rather, the set "action") with a few important fields:
1. `sys_var *var` - this is the variable that represents the target variable that you are going to SET.

> We'll be discussing sys_var in the next section. They are simply MySQL/Plugin declared variable instances with all parameters / helper function setup.

2. `Item *value` - the expression containing the right of the SET statement
3. `enum_var_type type` - the type of the variable (SESSION/GLOBAL)
4. `save_result` - an annoymous union containing integer/string/double/time/etc values used to store temporary results. 

It also supports a few operations:

1. `check` - check whether the SET is valid or not. It does a few simple validation and eventually delegate to `var->check()` where real work is done.

2. `update` - delegates to `var->update` in case of a real value (value != nullptr) or `var->set_default()` when you call `SET var=DEFAULT`.  

> The naming of `set_var` is rather poor in my opinion as it causes a significant confusion with `sys_var`. As we'll see later `sys_var` represents the system variable itself and its operations, while `set_var` represents the set statement / action itself, pointing to the variable (of sys_var type), and the value. It would be much better to name it as `set_stmt` or `set_action`. 

Inside `set_system_variable`, you can see we create set_var with the type, the variable (which we looked up earlier), and the value (that we constructed when parsing expression): 

```
static bool
set_system_variable(THD *thd, struct sys_var_with_base *tmp,
                    enum enum_var_type var_type, Item *val)
{
  set_var *var;
  LEX *lex= thd->lex;
  sp_head *sp= lex->sphead;
  sp_pcontext *pctx= lex->get_sp_current_parsing_ctx();

  /* ... */

  if (! (var= new set_var(var_type, tmp->var, &tmp->base_name, val)))
    return TRUE;

  var->thd_id= tmp->var->thd_id;
  return lex->var_list.push_back(var);
}

All `set_var` statements are added to lex->var_list to be executed later.

## System variables and `sys_var`

`sys_var` is the most important type here - it represents the variable itself.

1. `sys_var *next` - the chain of all variables. Needed to construct/destroy the hashtable.
2. `LEX_CSTRING name` - name of variable
3. `ptrdiff_t offset` - the offset to the global_system_variables where the real values are stored. More on that later.

In terms of operations, 
1. `set_default` - delegates to the global/session callback, and do a check/update just like any other update.

```
bool sys_var::set_default(THD *thd, set_var* var)
{
  if (var->type == OPT_GLOBAL || scope() == GLOBAL)
    global_save_default(thd, var);
  else
    session_save_default(thd, var);

  return check(thd, var) || update(thd, var);
}
```

2. `update` - delegates to `session_update` or `global_update`
3. `value_ptr` - delegates to `session_value_ptr` or `global_value_ptr` which simply returns the value stored at the offset:

```
  uchar *session_var_ptr(THD *thd)
  { return ((uchar*)&(thd->variables)) + offset; }

  uchar *global_var_ptr()
  { return ((uchar*)&global_system_variables) + offset; }
```

Not surprisingly, the real work is done in a bunch of pure virtual functions :
1. `do_check` - does the bounds check
2. `global_save_default` - set global variable to default
3. `global_update` - update the global variable to new value
4. `global_value_ptr` - return the global value in a pointer for SHOW
4. `session_update` & `session_save_default`


## Storage of variables

You might be wondering - where is the global_system_variables and thd->variables? They are simply struct variable of type system_variables. One global:

```
struct system_variables global_system_variables;
```

And one in THD:

```
class THD {
 public:
   struct  system_variables variables;	// Changeable local variables
}
```

`system_variables` struct is just a big chunk of variable definitions for all the system variables.

During initialization of system_variables, those are getting set as part of construction:

```
static Sys_var_mybool Sys_disable_trigger(
       "disable_trigger",
       "Disable triggers for the session.",
       SESSION_VAR(disable_trigger),
       CMD_LINE(OPT_ARG), DEFAULT(FALSE));
```

See the `SESSION_VAR` macro? They are defined as follows:

```
#define GLOBAL_VAR(X) sys_var::GLOBAL, (((char*)&(X))-(char*)&global_system_variables), sizeof(X)
#define SESSION_VAR(X) sys_var::SESSION, offsetof(SV, X), sizeof(((SV *)0)->X)
#define SESSION_ONLY(X) sys_var::ONLY_SESSION, offsetof(SV, X), sizeof(((SV *)0)->X)
```

So it's basically an offset. But if you look closely, there are actually different cases:

1. For a "pure" global variable (you can only set global), it is stored in an real variable. But the code would always access it from the global_system_variables offset though the actual variable has nothing to do with the `global_system_variables`. This is done for consistency so that the code doesn't have to change in terms of accessing the variable.

2. For a session variable, the global variable is accessed within `global_system_variables` based on the field offset within the struct, and so are the session variable itself. This is the reason why in this case the global variables also had to be accessed within the global_system_variables struct since the offset needs to be the same.

3. For a "pure" session variable, it is the same as #2 except it won't be ever accessed within `global_system_variables` struct based on the `sys_var::ONLY_SESSION` flag

## Initialization and lookup of system variables

Eventually it goes to:

```
sys_var *intern_find_sys_var(const char *str, uint length)
{
  sys_var *var;

  /*
    This function is only called from the sql_plugin.cc.
    A lock on LOCK_system_variable_hash should be held
  */
  var= (sys_var*) my_hash_search(&system_variable_hash,
                              (uchar*) str, length ? length : strlen(str));

  /* Don't show non-visible variables. */
  if (var && var->not_visible())
    return NULL;

  return var;
}
```

All these variables are added:

```
int mysql_add_sys_var_chain(sys_var *first)
{
  sys_var *var;

  /* A write lock should be held on LOCK_system_variables_hash */

  for (var= first; var; var= var->next)
  {
    /* this fails if there is a conflicting variable name. see HASH_UNIQUE */
    if (my_hash_insert(&system_variable_hash, (uchar*) var))
    {
      fprintf(stderr, "*** duplicate variable name '%s' ?\n", var->name.str);
      goto error;
    }
  }
  return 0;

error:
  for (; first != var; first= first->next)
    my_hash_delete(&system_variable_hash, (uchar*) first);
  return 1;
}

```

Every time when a sys_var gets initialized, it inserts itself into the chain:

```

sys_var::sys_var(sys_var_chain *chain, ...)
{
...
  if (chain->last)
    chain->last->next= this;
  else
    chain->first= this;
  chain->last= this;
}
```

All subclasses would call the base clas with the default all_sys_vars chain:

```
class Sys_var_typelib: public sys_var
{
protected:
  TYPELIB typelib;
public:
  Sys_var_typelib(const char *name_arg,
          const char *comment, int flag_args, ptrdiff_t off,
          CMD_LINE getopt,
          SHOW_TYPE show_val_type_arg, const char *values[],
          ulonglong def_val, PolyLock *lock,
          enum binlog_status_enum binlog_status_arg,
          on_check_function on_check_func, on_update_function on_update_func,
          const char *substitute, int parse_flag= PARSE_NORMAL)
    : sys_var(&all_sys_vars, name_arg, comment, flag_args, off, getopt.id,
 ``` 

And all_sys_vars chain is declared here:

```
sys_var_chain all_sys_vars = { NULL, NULL };

```

You can see all the system variables in MySQL are declared this way in sys_vars.cc:

```
static Sys_var_mybool Sys_disable_trigger(
       "disable_trigger",
       "Disable triggers for the session.",
       SESSION_VAR(disable_trigger),
       CMD_LINE(OPT_ARG), DEFAULT(FALSE));
```

As part of global construction they'll get added into the global sys_var_chain.

However, that byitself isn't quite enough - they still need to be added into the hash chain:

```
int sys_var_init()
{
  DBUG_ENTER("sys_var_init");

  /* Must be already initialized. */
  DBUG_ASSERT(system_charset_info != NULL);

  if (my_hash_init(&system_variable_hash, system_charset_info, 100, 0,
                   0, (my_hash_get_key) get_sys_var_length, 0, HASH_UNIQUE))
    goto error;

  if (mysql_add_sys_var_chain(all_sys_vars.first))
    goto error;

  DBUG_RETURN(0);

error:
  fprintf(stderr, "failed to initialize System variables");
  DBUG_RETURN(1);
}
```

And `mysql_add_sys_var_chain` gets the real job done:

```
int mysql_add_sys_var_chain(sys_var *first)
{
  sys_var *var;

  /* A write lock should be held on LOCK_system_variables_hash */

  for (var= first; var; var= var->next)
  {
    /* this fails if there is a conflicting variable name. see HASH_UNIQUE */
    if (my_hash_insert(&system_variable_hash, (uchar*) var))
    {
      fprintf(stderr, "*** duplicate variable name '%s' ?\n", var->name.str);
      goto error;
    }
  }
  return 0;

error:
  for (; first != var; first= first->next)
    my_hash_delete(&system_variable_hash, (uchar*) first);
  return 1;
}
```










```

class sys_var
{
  virtual bool do_check(THD *thd, set_var *var) = 0;
  virtual void session_save_default(THD *thd, set_var *var) = 0;
  virtual void global_save_default(THD *thd, set_var *var) = 0;
  virtual bool session_update(THD *thd, set_var *var) = 0;
  virtual bool global_update(THD *thd, set_var *var) = 0;

```


