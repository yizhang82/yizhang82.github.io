---
layout: post
title:  "Diagnosing interesting MySQL client connection error in localhost through the source code"
description: "The art of argument parsing and policy transparency"
permalink: mysql-client-connect-error 
comments: true
excerpt_separator: <!--more-->
categories:
- mysql
- database
---

When working with MySQL the often most frustrating part is getting strange connection errors. I've wasted two hours trying to connect to a MySQL server using TCP port (unix domain sockets works fine) and I'll talk about why it didn't work, and as usual we'll dive into the code to understand exactly why.

To simplify the problem, let's say I have MySQL server at port 13010 and bound to localhost, with user name root and empty password (don't do that in production):

```
[~/mysql]: mysql -p 13010 -h localhost -u root
Enter password:
ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/var/lib/mysql/mysql.sock' (2)
```

This is typical error many people will run into and you can find many similar posts that discuss the problem but few ever got to the bottom of it. Let's jump right in.

## -p and -P

Obviously when I write `-p 13010` I meant to tell `mysql` client to connect to server using port 13010, but that's not quite right:

```
[~/mysql]: mysql --help
  -p, --password[=name]
                      Password to use when connecting to server. If password is
  -P, --port=#        Port number to use for connection or 0 for default to, in
```

So I actually told mysql the password is 13010 instead. Supporting both `-p` and `-P` is a apparently very bad idea.

> Linux tools often have excessive amount of short options, like this one from man page for ls:
>
> ls [-ABCFGHLOPRSTUW@abcdefghiklmnopqrstuwx1] [file ...]
> 
> Personally I think they should go easy and only include the most common ones rather than using the entire alphabet.

However, the mystery is not yet solved. Note that we have been asked to enter the password, which explains why most people never suspected `-p` actually means password. Put in other words - if `-p` means password, why is this command is still asking for password?

The answer lies in the source code:

[my_getopt.cc](https://github.com/mysql/mysql-server/blob/5.6/mysys_ssl/my_getopt.cc)

```c++
  for (optend= cur_arg; *optend; optend++)
	{
	  opt_found= 0;
	  for (optp= longopts; optp->name; optp++)
	  {
	    if (optp->id && optp->id == (int) (uchar) *optend)
	    {
	      /* Option recognized. Find next what to do with it */
	      opt_found= 1;
	      if (optp->arg_type == REQUIRED_ARG ||
		        optp->arg_type == OPT_ARG)
	      {
					if (*(optend + 1))
					{
						/* The rest of the option is option argument */
						argument= optend + 1;
						/* This is in effect a jump out of the outer loop */
						optend= (char*) " ";
					}
					else
					{
						if (optp->arg_type == OPT_ARG)
						{
							if (optp->var_type == GET_BOOL)
								*((my_bool*) optp->value)= (my_bool) 1;
							if (get_one_option && get_one_option(optp->id, optp, argument))
								return EXIT_UNSPECIFIED_ERROR;
							continue;
						}
						/* Check if there are more arguments after this one */
      		  argument= *++pos;
		        (*argc)--;
```

The `*(optend + 1)` is the most interesting part. If a short-form option is being recognized, the rest immediately following the short option is treated as argument:

```c++
					if (*(optend + 1))
					{
						/* The rest of the option is option argument */
						argument= optend + 1;
						/* This is in effect a jump out of the outer loop */
						optend= (char*) " ";
```

Given that we are not passing `-p13010`, the `13010` part is ignored. 

But wait, why does `-h localhost` work fine?

Just keep looking:

```c++
						if (optp->arg_type == OPT_ARG)
						{
							if (optp->var_type == GET_BOOL)
								*((my_bool*) optp->value)= (my_bool) 1;
							if (get_one_option && get_one_option(optp->id, optp, argument))
								return EXIT_UNSPECIFIED_ERROR;
							continue;
						}
						/* Check if there are more arguments after this one */
						if (!pos[1])
		        {
              return EXIT_ARGUMENT_REQUIRED;
	       	  }
      		  argument= *++pos;
		        (*argc)--;
```

So if the argument is an optional arg, it'll give up and only check for immediate following argument. Otherwise, for OPT_REQUIRED, it assumes the next one is the argument. 

Let's take a look at where they are defined:

```c++
  {"password", 'p',
   "Password to use when connecting to server. If password is not given it's asked from the tty.",
   0, 0, 0, GET_PASSWORD, OPT_ARG, 0, 0, 0, 0, 0, 0},
  {"host", 'h', "Connect to host.", &current_host,
   &current_host, 0, GET_STR_ALLOC, REQUIRED_ARG, 0, 0, 0, 0, 0, 0},
```

As expected, password is optional and host is required.

Also, note that how it never checked for '='? So the syntax `-p=abc` wouldn't work as expected as well. And hilariously `=abc` would become the password. For arguments with a bit more error checking like port, the error message is a bit better: 

```
[~/mysql]: mysql -P=13010 
mysql: [ERROR] Unknown suffix '=' used for variable 'port' (value '=13010')
mysql: [ERROR] mysql: Error while setting value '=13010' to 'port'
```

Note the '=13010' part?

## Default protocol 

OK. Let's try again:

```
[~/mysql/mysql-fork]: mysql -P 13010 -h localhost -u root
ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/var/lib/mysql/mysql.sock' (2)
```

Still doesn't work. We know it's not the parsing of -P because port is OPT_REQUIRED:

```c++
  {"port", 'P', "Port number to use for connection or 0 for default to, in "
   "order of preference, my.cnf, $MYSQL_TCP_PORT, "
#if MYSQL_PORT_DEFAULT == 0
   "/etc/services, "
#endif
   "built-in default (" STRINGIFY_ARG(MYSQL_PORT) ").",
   &opt_mysql_port,
   &opt_mysql_port, 0, GET_UINT, REQUIRED_ARG, 0, 0, 0, 0, 0,  0},
```

Note the error message `socket '/var/lib/mysql/mysql.sock`. This is for domain socket. 

To confirm this is the issue, let's search for the actual error message:

```c++
const char *client_errors[]=
{
  "Unknown MySQL error",
  "Can't create UNIX socket (%d)",
  "Can't connect to local MySQL server through socket '%-.100s' (%d)",
```

The client_errors are looked up from error codes:

```c++
#define ER(X) (((X) >= CR_ERROR_FIRST && (X) <= CR_ERROR_LAST)? \
               client_errors[(X)-CR_ERROR_FIRST]: client_errors[CR_UNKNOWN_ERROR])
```

And the 3rd error is `CR_SOCKET_CREATE_ERROR`:

```
#define CR_ERROR_FIRST  	2000 /*Copy first error nr.*/
#define CR_UNKNOWN_ERROR	2000
#define CR_SOCKET_CREATE_ERROR	2001
```

Searching for that leads us back to client.cc:

```c++
  if (!net->vio &&
      (!mysql->options.protocol ||
       mysql->options.protocol == MYSQL_PROTOCOL_SOCKET) &&
      (unix_socket || mysql_unix_port) &&
      (!host || !strcmp(host,LOCAL_HOST)))
  {
    my_socket sock= socket(AF_UNIX, SOCK_STREAM, 0);
    DBUG_PRINT("info", ("Using socket"));
    if (sock == SOCKET_ERROR)
    {
      set_mysql_extended_error(mysql, CR_SOCKET_CREATE_ERROR,
                               unknown_sqlstate,
                               ER(CR_SOCKET_CREATE_ERROR),
                               socket_errno);
      DBUG_RETURN(STATE_MACHINE_FAILED);
    }
```

So this means by default we are connecting using Unix domain socket, and only if host is not specifed or is localhost!

> Programs should be transparent about its policies, and give information about what it is doing. If that can end up being too verbose, add a verbose option. I'll write a separate post about this because I've been bitten too many times by similar issues and now my favorite past-time is to add print/printf.

So there are two ways to fix this:

1. Instead of local host, use `127.0.0.1`. This fails the UNIX socket check and will fallback to TCP.
2. Use `--protocol tcp` to force using TCP.

So the right command would be:

```
mysql -P 13010 -h localhost -u root --protocol tcp 
```

or

```
mysql -P 13010 -h 127.0.0.1 -u root
```

## Summary

These two problems can be easily avoided by adding more messages to the mysql client, such as:

```
Trying to connect to UNIX domain socket localhost...
Connecting to database `12310`. 
```

These would've avoided wasting collectively god knows how much time wasted. Maybe I should submit a patch when I get a chance.

The gotchas:

1. mysql short-option with optional args only accept arguments when they immediately follow the option, such as '-pmypassword'. Specifying as '-p blah' and blah will be interpreted as current database. Short option with required args don't have this problem.

2. When there is no protocol specified, mysql will try to connect as UNIX domain socket if connecting to localhost or host isn't specified. To work around it, use IP address instead of localhost, or specify protocol explicitly using `--protocol`.



