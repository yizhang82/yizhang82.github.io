---
layout: post
title:  "Tip - how to test other people's Github PR locally"
description: how to test other people's Github PR locally
permalink: test-github-pr
comments: true
excerpt_separator: <!--more-->
categories:
- github
- tip
---

Sometimes you might want to test other people's PR before it is merged - perhaps you want to test drive the feature or validate the fix yourself, for whatever reason. However it is in the author's private fork and you don't have access to that directly. GitHub supports two ways to allow you to download that PR to your branch:

## Downloading the PR as a patch and apply locally

GitHub has a "secret" feature that allows you to download any PR as a patch. Just go to the PR's request url and add `.diff` or `.patch`. For example:

```

git checkout -b branch4895
curl https://github.com/facebook/rocksdb/pull/4895.patch > 4895.patch
git apply 4895.patch

```

## Downloading the PR from remote

Assuming you want to download the PR 4895:

```
git fetch origin pull/4895/head:branch_4895
```

This fetches the PR remotely and create a `branch_4895` at the same time. 

For more reference, you can refer to these two sources:

* (GitHub help - checking out pull request locally)[https://help.github.com/articles/checking-out-pull-requests-locally/]
* (Stackoverflow post)[https://stackoverflow.com/questions/6188591/download-github-pull-request-as-unified-diff]
* (Git help - how to create/apply patches)[https://makandracards.com/makandra/2521-git-how-to-create-and-apply-patches]

