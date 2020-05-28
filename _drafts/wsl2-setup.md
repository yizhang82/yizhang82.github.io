---
layout: post
title:  "My experience in setting up WSL 2"
description: Tips for setting up WSL 2 environment
permalink: set-up-wsl2
comments: true
excerpt_separator: <!--more-->
categories:
- wsl
- linux
---

# My experience in setting up WSL 2

## Why not just Linux?

I use a MBP 16 for my daily work and SSH into linux machines for development/testing. I do have a T470p which works very well with Ubuntu. However, I have another laptop X1-carbon gen7 that I like quite a bit has this crazy Dolby surround 4-channel speakers which works quite well under Windows but just performs poorly in linux. After some research I eventually got tired of spending time on it, so I thought I should give WSL 2 a try now that Windows 10 May 2020 is here. 

Setting it up is not too bad - you do need to follow

## Moving it to another disk

## Limiting memory growth

By default WSL 2 is setup to consume up to 80% of system memory which is way too high. In my 16GB laptop I'm setting this to 6GB (8GB is still too high with a few chrome tabs open and VSCode open side by side). Hopefully future versions this limit can be more dynamic depending on system memory consumption. Before that happens, you'll need to write following to `%USERPROFILE%\.wslconfig`.

```
[wsl2]
memory=6GB
swap=0
localhostForwarding=true
```

## Terminal

[Windows Terminal](https://docs.microsoft.com/en-us/windows/terminal/) is a modern terminal that supports different shell like ubuntu shell, cmd, powershell, etc. I find it works well with zsh/tmux and supports color themes and good font rendering, so that's the one I'm using right now. 

I've set it up with [Ubuntu Mono font](https://design.ubuntu.com/font/) and [Afterglow](https://github.com/mbadolato/iTerm2-Color-Schemes/blob/master/windowsterminal/Afterglow.json) theme so it looks fairly close to a Terminal under linux.

## Setting up git credentials

Because there is no desktop support there, you can't use libsecret which uses dbus. If you set it up, you'll eventually run into this error:

```
** (process:7902): CRITICAL **: could not connect to Secret Service: Cannot autolaunch D-Bus without X11 $DISPLAY
```

Fortunately, given this is windows and WSL supports Windows Interop, you can just use `git-credential-manager.exe` which works surprisingly well:

```
git config --global credential.helper "/mnt/c/Program\ Files/Git/mingw64/libexec/git-core/git-credential-manager.exe"
```

## Docker

You can install docker as usual, but whenever you try to launch any container you'll get this error:

```
docker: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?.
```

Given that there is no systemd installed, docker doesn't know how to automatically launch docker daemon. You can still do it in the good old system-V style:

```
sudo service docker start
```

## Copying text to clipboard in tmux

Under regular linux you could juse use `xsel` / `xclip` which isn't an option here as there is no X window installed. Again, because there is Windows interop, you can juse use `clip.exe`!

You can set it up in tmux so that it integrates with your clipboard.

```
bind-key -Tcopy-mode-vi 'y' send -X copy-pipe "clip.exe"
```

I have a script that auto detects Linux/Mac/WSL and use the correct copy tool correctly [in github](https://github.com/yizhang82/dotfiles/blob/master/utils/copy) based on https://github.com/Parth/dotfiles/blob/master/utils/copy.

## My overall impression
