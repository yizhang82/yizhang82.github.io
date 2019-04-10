


```

# Create the target branch as usual in 8.0
git checkout -b your-port-branch

# Rename mysqldump.cc back to mysqldump.c to make git cherry-pick happy
git mv client/mysqldump.cc client/mysqldump.c
git commit -m "Make git happy"

# Cherry-pick as usual
git cherry-pick -x <commit>

# Rename it back
git mv client/mysqldump.c client/mysqldump.cc
git commit -m "Rename back"

# Squash the 3 commits into one
git rebase -i HEAD~3

```

