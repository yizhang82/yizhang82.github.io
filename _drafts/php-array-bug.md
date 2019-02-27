---
layout: post
title:  "Story about my horrible PHP: array and unset"
description: PHP arrays are not arrays 
permalink: php-array-and-unset 
comments: true
excerpt_separator: <!--more-->
categories:
- php 
- bug
---

In my new job I sometimes had to tinker with infrastructure stuff, and quite bit of that is written in PHP for whatever reason... I'm mostly a C++ and C# guy, and my Python/Javascript/Go/Java isn't terrible, but my PHP just sucks. In this case I have a simple function like this: 

```php

function remove_headers($paths) {
  for ($i = 0; $i < count($paths); $i++) {
    $path = $paths[$i];

    // Remove header files
    if (preg_match("/\.hpp$/", $path) or
        preg_match("/\.h$/", $path)) {
      unset($paths[$i]);
    }
  }
  return $paths;
}

```

It doesn't get simpler: it just removes header files (ends with .h, .hpp, not surprisingly) from the `$paths` collection.

Now PHP gurus, can you spot the bug?

I've scratched my head for a while until I figured out what it is: whenever you call `unset` to remove the element from the array it also changes the count without changing the index, so it becomes an array with holes (or a dict). This makes sense - otherwise the loop wouldn't work anyway with indexing shifting around. Now, with the count getting smaller, when you are trying to get the elements towards the end of the array, the `$i` will end up being more than the new count and end up terminating the loop early!

The fix is easy - just remember the count:

```php

function remove_headers($paths) {
  $last = count($paths);
  for ($i = 0; $i < $last; $i++) {
    $path = $paths[$i];

    // Remove header files
    if (preg_match("/\.hpp$/", $path) or
        preg_match("/\.h$/", $path)) {
      unset($paths[$i]);
    }
  }
  return $paths;
}

```

Because `unset` only creates holes but never changes the index of existing items, it works. This basically means PHP doesn't have a real array in true 'C' sense, only dictionaries. However in memory you could have two representations - the optimized array representation when the index is ordered integer starting from 0, and dictionary for everything else.  

One interesting take away is that when you are working in a unfamiliar language, it's easy to find yourself to be in basically get-in and get-out mindset - just keep tinkering until you get things working without thinking through the implication of all the language features.

Note to self 1: Find a PHP book to read at some point.

Note to self 2: Don't look for a PHP job. Ever.

