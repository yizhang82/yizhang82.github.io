---
layout: post
title:  "Get cherry-pick to work across file renames"
description: Making cherry-pick work across file renames 
permalink: cherry-pick-rename 
comments: true
excerpt_separator: <!--more-->
categories:
- git 
---

Recently I need to port over some changes using cherry-pick and that usually works fine without any issues (except for occasional conflicts), but this time the actual file `foo.cc` was renamed to `bar.cc`. In such case `git cherry-pick` simply gives up and simply tells you the old file you are changing has been deleted. As far as I can tell there isn't a good way to resolve the conflict.

There are a couple of ways to address this issue. But the easiest way I found is to just rename the file back to the original name where you had made the change on, in order to make git happy. Once that's done, cherry-picking would work fine as usual. Now just rename the file back to the 'new' name. Squash the change. 

This can be illustrated in following example - assuming:

1. Your commit modifies foo.cc
2. In the target branch (that you want to cherry-pick) renames foo.cc to bar.cc

```
# Create the target branch as usual
git checkout -b your-target-branch

# Rename bar.cc back to foo.cc to make git cherry-pick happy
git mv bar.cc foo.cc 
git commit -m "Make git happy"

# Cherry-pick as usual
git cherry-pick -x <commit>

# Rename it back
git mv foo.cc bar.cc 
git commit -m "Rename back"

# Squash the 3 commits into one
git rebase -i HEAD~3
```

In the rebase file, you'll see:

```
pick 95be80db682 Make git happy
pick 3d74c6c9e13 Cherry-pick commit blah
pick 238e3c51354 Rename back
```

Change to:

```
pick 95be80db682 Make git happy
s 3d74c6c9e13 Cherry-pick commit blah
s 238e3c51354 Rename back
```

Here s means squash with previous commit.

Just remember in commit message deleting the first and third unrelated commit.

And now you are all set!

     
