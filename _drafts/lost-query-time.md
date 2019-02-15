---
layout: post
title:  "Where did the query time go"
description: Where did the query time go?
permalink: lost-query-time
comments: true
excerpt_separator: <!--more-->
categories:
- python
- bug
---

At some point I was trying to understand the top queries in the system, and I used one little python script someone else wrote that connects to the database and dump all the queries, and collect all the queries, they look something like this:

```
Total query time: 144

...

```

If you are paying attention, you probably notice by now something is off: giving the numbers are obviously sorted, adding these numbers together doesnt add up to 144 (second). The script itself is quite straight-forward, it scans a log containing all queries, and then add them up per query, and roll up to the total query time. It looked fine. 

Then I went back and look at the actual log:

```
SELECT X, time: 0.20345
SELECT Y, time: 0.10987
SELECT Z, time: 0.00123
SELECT Z, time: 0.00223
SELECT Z, time: 0.00098
SELECT Z, time: 0.00078
...
```


There are a lot of queries, but they look reasonable as well. 
Could it be that the log itself is incorrect? That seems impossible, because the counting is performed on the log so it should at least be consistent with itself.  
Now I was stuck... 

Then I went back to the script and try to see what I was missing: there is one line that caught my attention:

```
each_query_time[query] += round(float(current_query_time), 3)
```

This looks fine by itself. But then I recall when looking at the individual query time - they are usually small and many of them are 0.00X or 0.000X where the rounding could play a significant difference, and if you have a lot of them they could add up. 

Now looking at the other time confirmed my suspicious even further:

```
total_query_time += current_query_time
```

See? The `total_time` didn't get rounded during calculation. At least not until it is actually printed:

```
print "total_time =", total_query_time
```

Fixing this is really easy - just get rid of the round. Now all the queries actually adds up to the `total_query_time`.

What's the lesson here? 
1. Don't round your numbers during calculation. 
2. Always know your scenario. In this case the small queries can be quite small (less than 0.01) and there are a lot of queries (100000+), and the errors add up. 
