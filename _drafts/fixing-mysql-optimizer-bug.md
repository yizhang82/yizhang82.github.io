# Running into and fixing a MySQL 8.0 optimizer bug

Let's look at one interesting case.

Suppose we have table:

```sql
CREATE TABLE `test_or` (
  `a` bigint unsigned NOT NULL,
  `b` bigint unsigned NOT NULL,
  `c` bigint unsigned NOT NULL,
  `d` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`a`,`b`,`c`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
```

The table has 20k entries:
* 10k (1, 1, 1) - (1, 1, 10000)
* 10k (2, 1, 1) - (2, 1, 10000)

This SQL should return empty result pretty much immediately:

```sql
mysql> select * from test_or where (a = 1 and b = 2 and c > 1) OR (a > 3);
Empty set (0.00 sec)
```

Not surprisingly, it did. Because there are exactly 0 items match the query. Given that InnoDB has clustered index (and so is MyRocks, if you are curious), all the primary key data are sorted in PK order, so MySQL should be able to do two seek for the two ranges:
* Seek to (A = 1, B = 2, C = 1) and land on (A = 2, B = 1, C = 1), and immediately see that there are 0 items matching the condition (A = 1, B = 2, C > 1)
* Seek to (A = 3) and immediately reaching the end of the data
So MySQL should be able to see that 0 items match the condition super fast.

However, a pretty much identical query didn't:

```sql
mysql> select * from test_or where (a = 1 and b > 1 and c > 1) OR (a = 1 and b > 1 and c > 1) OR (a > 3);

Empty set (0.41 sec)
```

It did return empty set, but it took much longer. But why?

## Looking at the query optimizer trace

First, let's look at the explain:

```
mysql> explain select * from test_or where (a = 1 and b = 2 and c > 1) OR (a = 1 and b = 2 and c > 1) OR
(a > 3);
+----+-------------+---------+------------+-------+---------------+---------+---------+------+-------+----------+-------------+
| id | select_type | table   | partitions | type  | possible_keys | key     | key_len | ref  | rows  | filtered | Extra       |
+----+-------------+---------+------------+-------+---------------+---------+---------+------+-------+----------+-------------+
|  1 | SIMPLE      | test_or | NULL       | range | PRIMARY       | PRIMARY | 8       | NULL | 10281 |   100.00 | Using where |
+----+-------------+---------+------------+-------+---------------+---------+---------+------+-------+----------+-------------+
1 row in set, 1 warning (0.00 sec)
```

And look at the good case:

```
mysql> explain select * from test_or where (a = 1 and b = 2 and c > 1) OR (a > 3);
+----+-------------+---------+------------+-------+---------------+---------+---------+------+------+----------+-------------+
| id | select_type | table   | partitions | type  | possible_keys | key     | key_len | ref  | rows | filtered | Extra       |
+----+-------------+---------+------------+-------+---------------+---------+---------+------+------+----------+-------------+
|  1 | SIMPLE      | test_or | NULL       | range | PRIMARY       | PRIMARY | 24      | NULL |    2 |   100.00 | Using where |
+----+-------------+---------+------------+-------+---------------+---------+---------+------+------+----------+-------------+
1 row in set, 1 warning (0.01 sec)
```

It's not difficult to see the biggest difference seems to be:
* The "bad" query is using less key (key_length = 8, which is the first bigint field a) and potentially scan more rows (~10281)
* The "good" query is using full key (key_length=24, which consists a, b, c) and only scans two rows.

Keep in mind the rows are simply estimates from index stats, but the difference seems to be night-and-day. Scanning only using partial key (key_len = 8) using values of A is going to scan way more rows potentially.

In order to see what actually is going on, the optimizer traces gives us the best clue. This [doc](https://dev.mysql.com/doc/internals/en/optimizer-tracing.html) explains how to enable optimizer trace - we just need to run the following:

```
mysql> SET optimizer_trace="enabled=on";
mysql> explain select * from test_or where (a = 1 and b = 2 and c > 1) OR (a = 1 and b = 2 and c > 1) OR
(a > 3);
mysql> SELECT * FROM INFORMATION_SCHEMA.OPTIMIZER_TRACE;
```

And we'll get:

```
```


```
explain select * from test_or where (a = 1 and b = 2 and c > 1) OR (a = 1 and b = 2 and c > 1) OR (a > 3) | {
  "steps": [
    {
      "join_preparation": {
        "select#": 1,
        "steps": [
          {
            "expanded_query": "/* select#1 */ select `test_or`.`a` AS `a`,`test_or`.`b` AS `b`,`test_or`.`c` AS `c`,`test_or`.`d` AS `d` from `test_or` where (((`test_or`.`a` = 1) and (`test_or`.`b` = 2) and (`test_or`.`c` > 1)) or ((`test_or`.`a` = 1) and (`test_or`.`b` = 2) and (`test_or`.`c` > 1)) or (`test_or`.`a` > 3))"
          }
        ]
      }
    },
    {
      "join_optimization": {
        "select#": 1,
        "steps": [
          {
            "condition_processing": {
              "condition": "WHERE",
              "original_condition": "(((`test_or`.`a` = 1) and (`test_or`.`b` = 2) and (`test_or`.`c` > 1)) or ((`test_or`.`a` = 1) and (`test_or`.`b` = 2) and (`test_or`.`c` > 1)) or (`test_or`.`a` > 3))",
              "steps": [
                {
                  "transformation": "equality_propagation",
                  "resulting_condition": "(((`test_or`.`c` > 1) and multiple equal(1, `test_or`.`a`) and multiple equal(2, `test_or`.`b`)) or ((`test_or`.`c` > 1) and multiple equal(1, `test_or`.`a`) and multiple equal(2, `test_or`.`b`)) or (`test_or`.`a` > 3))"
                },
                {
                  "transformation": "constant_propagation",
                  "resulting_condition": "(((`test_or`.`c` > 1) and multiple equal(1, `test_or`.`a`) and multiple equal(2, `test_or`.`b`)) or ((`test_or`.`c` > 1) and multiple equal(1, `test_or`.`a`) and multiple equal(2, `test_or`.`b`)) or (`test_or`.`a` > 3))"
                },
                {
                  "transformation": "trivial_condition_removal",
                  "resulting_condition": "(((`test_or`.`c` > 1) and multiple equal(1, `test_or`.`a`) and multiple equal(2, `test_or`.`b`)) or ((`test_or`.`c` > 1) and multiple equal(1, `test_or`.`a`) and multiple equal(2, `test_or`.`b`)) or (`test_or`.`a` > 3))"
                }
              ]
            }
          },
          {
            "substitute_generated_columns": {
            }
          },
          {
            "table_dependencies": [
              {
                "table": "`test_or`",
                "row_may_be_null": false,
                "map_bit": 0,
                "depends_on_map_bits": [
                ]
              }
            ]
          },
          {
            "ref_optimizer_key_uses": [
            ]
          },
          {
            "rows_estimation": [
              {
                "table": "`test_or`",
                "range_analysis": {
                  "table_scan": {
                    "rows": 20560,
                    "cost": 2082.3
                  },
                  "potential_range_indexes": [
                    {
                      "index": "PRIMARY",
                      "usable": true,
                      "key_parts": [
                        "a",
                        "b",
                        "c"
                      ]
                    }
                  ],
                  "setup_range_conditions": [
                  ],
                  "group_index_range": {
                    "chosen": false,
                    "cause": "not_group_by_or_distinct"
                  },
                  "skip_scan_range": {
                    "potential_skip_scan_indexes": [
                      {
                        "index": "PRIMARY",
                        "usable": false,
                        "cause": "query_references_nonkey_column"
                      }
                    ]
                  },
                  "analyzing_range_alternatives": {
                    "range_scan_alternatives": [
                      {
                        "index": "PRIMARY",
                        "ranges": [
                          "1 <= a <= 1",
                          "3 < a"
                        ],
                        "index_dives_for_eq_ranges": true,
                        "rowid_ordered": true,
                        "using_mrr": false,
                        "index_only": false,
                        "rows": 10281,
                        "cost": 1034,
                        "chosen": true
                      }
                    ],
                    "analyzing_roworder_intersect": {
                      "usable": false,
                      "cause": "too_few_roworder_scans"
                    }
                  },
                  "chosen_range_access_summary": {
                    "range_access_plan": {
                      "type": "range_scan",
                      "index": "PRIMARY",
                      "rows": 10281,
                      "ranges": [
                        "1 <= a <= 1",
                        "3 < a"
                      ]
                    },
                    "rows_for_plan": 10281,
                    "cost_for_plan": 1034,
                    "chosen": true
                  }
                }
              }
            ]
          },
          {
            "considered_execution_plans": [
              {
                "plan_prefix": [
                ],
                "table": "`test_or`",
                "best_access_path": {
                  "considered_access_paths": [
                    {
                      "rows_to_scan": 10281,
                      "filtering_effect": [
                      ],
                      "final_filtering_effect": 1,
                      "access_type": "range",
                      "range_details": {
                        "used_index": "PRIMARY"
                      },
                      "resulting_rows": 10281,
                      "cost": 2062.1,
                      "chosen": true
                    }
                  ]
                },
                "condition_filtering_pct": 100,
                "rows_for_plan": 10281,
                "cost_for_plan": 2062.1,
                "chosen": true
              }
            ]
          },
          {
            "attaching_conditions_to_tables": {
              "original_condition": "(((`test_or`.`b` = 2) and (`test_or`.`a` = 1) and (`test_or`.`c` > 1)) or ((`test_or`.`b` = 2) and (`test_or`.`a` = 1) and (`test_or`.`c` > 1)) or (`test_or`.`a` > 3))",
              "attached_conditions_computation": [
              ],
              "attached_conditions_summary": [
                {
                  "table": "`test_or`",
                  "attached": "(((`test_or`.`b` = 2) and (`test_or`.`a` = 1) and (`test_or`.`c` > 1)) or ((`test_or`.`b` = 2) and (`test_or`.`a` = 1) and (`test_or`.`c` > 1)) or (`test_or`.`a` > 3))"
                }
              ]
            }
          },
          {
            "finalizing_table_conditions": [
              {
                "table": "`test_or`",
                "original_table_condition": "(((`test_or`.`b` = 2) and (`test_or`.`a` = 1) and (`test_or`.`c` > 1)) or ((`test_or`.`b` = 2) and (`test_or`.`a` = 1) and (`test_or`.`c` > 1)) or (`test_or`.`a` > 3))",
                "final_table_condition   ": "(((`test_or`.`b` = 2) and (`test_or`.`a` = 1) and (`test_or`.`c` > 1)) or ((`test_or`.`b` = 2) and (`test_or`.`a` = 1) and (`test_or`.`c` > 1)) or (`test_or`.`a` > 3))"
              }
            ]
          },
          {
            "refine_plan": [
              {
                "table": "`test_or`"
              }
            ]
          }
        ]
      }
    },
    {
      "join_explain": {
        "select#": 1,
        "steps": [
        ]
      }
    }
  ]
}
```

There are a lot of information to unpack here, but for now we only need to focus these:

```
                  "chosen_range_access_summary": {
                    "range_access_plan": {
                      "type": "range_scan",
                      "index": "PRIMARY",
                      "rows": 10281,
                      "ranges": [
                        "1 <= a <= 1",
                        "3 < a"
                      ]
                    },
                    "rows_for_plan": 10281,
                    "cost_for_plan": 1034,
                    "chosen": true
                  }
```

Note the values here matches what we see exactly in the explain earlier, with more detailed information. It means we are going to scan the two ranges `1 <= a <= 1` and "3 < a", estimating 10281 rows, with the cost being 1034. Note both of the range is are using a, so that explains why key_len = 8. if we end up scanning the A = 1 range, and discarding every single one of them, this is obviously super wasteful. So what happened?

## Finding the root cause

To find the root cause, we can obviously debug into the optimizer, and step through the range optimizer code and see what it went wrong. However, there is actually a better trace we can use - MySQL provides debug trace that signals the exact steps that the code executes, provided that the code has necessary macros to enable tracing and debug logs. The caveat? You need to use a debug build. If you are not sure how to build your own, you can refer to [this post](/hacking-mysql-1).

[This documentation](https://dev.mysql.com/doc/refman/8.0/en/dbug-package.html) explains the steps. For our purpose, we can just set:

```
mysql> set debug="d:t:o,/tmp/mysqld.trace"
```

And then re-run our query or explain, then open `/tmp/mysqld.trace`.

The output is too long to paste here - you can refer to my [github-gist](...). The most important section is here:

```
 | | | | | | | | | | | | >tree_or
 | | | | | | | | | | | | | >sel_trees_can_be_ored
 | | | | | | | | | | | | | | info: sel_tree: 0x7f166010ce90, type=2, tree1->keys[0(0)]: (1 <= a <= 1 AND 2 <= b <= 2 AND 1 < c)
 | | | | | | | | | | | | | | info: sel_tree: 0x7f166010d1f0, type=2, tree2->keys[0(0)]: (1 <= a <= 1 AND 2 <= b <= 2 AND 1 < c)
 | | | | | | | | | | | | | <sel_trees_can_be_ored
 | | | | | | | | | | | | <tree_or
 | | | | | | | | | | | | info: sel_tree: 0x7f166010ce90, type=2, after_or->keys[0(0)]: (1 <= a <= 1)
```

The optimizer here is trying to merge the two sub tree (or query expression) `a = 1 AND b = 2 AND c > 1` and `a = 1 AND b = 2 AND c > 1` into a hopefully simpler sub tree. For example, it can merge (A = 1) OR (A > 1) into (A >= 1). However, we can see `after_or` the tree becomes `a = 1`.

The corresponding MySQL code is below:

```c++
if (((Item_cond *)cond)->functype() == Item_func::COND_AND_FUNC) {
      tree = nullptr;
      Item *item;
      while ((item = li++)) {
        SEL_TREE *new_tree = get_mm_tree(param, item);
        if (param->has_errors()) return nullptr;
        tree = tree_and(param, tree, new_tree);
        dbug_print_tree("after_and", tree, param);
        if (tree && tree->type == SEL_TREE::IMPOSSIBLE) break;
      }
    } else {  // Item OR
      tree = get_mm_tree(param, li++);
      if (param->has_errors()) return nullptr;
      if (tree) {
        Item *item;
        while ((item = li++)) {
          SEL_TREE *new_tree = get_mm_tree(param, item);
          if (new_tree == nullptr || param->has_errors()) return nullptr;
          tree = tree_or(param, tree, new_tree);
          dbug_print_tree("after_or", tree, param);
          if (tree == nullptr || tree->type == SEL_TREE::ALWAYS) break;
        }
      }
    }
```

## Firing up the debugger

Now we need to fire up the debugger and attach the mysql process to find out exactly why. We've already narrowed down the problem to `tree_or`. The core logic of `tree_or` when handling mergable ranges is `key_or`, which is a super complicated function that is responsible for merge all kinds of different ranges.

In our case, the most relevant piece of code is this one:

```
    if (eq_tree(cur_key1->next_key_part, cur_key2->next_key_part)) {
      // Merge overlapping ranges with equal next_key_part
      if (cur_key1->is_same(cur_key2)) {
        /*
          cur_key1 covers exactly the same range as cur_key2
          Use the relevant range in key1.
        */
        cur_key1->merge_flags(cur_key2);    // Copy maybe flags
        cur_key2->release_next_key_part();  // Free not used tree
```

`key_or` walks through the two ranges, start with A = 1, and see that both keys are identical (B = 2 and C > 1), so decided to merge them and only use the first range. So far so good.




