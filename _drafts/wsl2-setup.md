---
layout: post
title:  "Setting up WSL 2"
description: Tips for setting up WSL 2 environment
permalink: set-up-wsl2
comments: true
excerpt_separator: <!--more-->
categories:
- wsl
- linux
---

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

## Neofetch

```

            .-/+oossssoo+/-.               yizhang82@yzha-carbon
        `:+ssssssssssssssssss+:`           ---------------------
      -+ssssssssssssssssssyyssss+-         OS: Ubuntu 20.04 LTS on Windows 10 x86_64
    .ossssssssssssssssssdMMMNysssso.       Kernel: 4.19.84-microsoft-standard
   /ssssssssssshdmmNNmmyNMMMMhssssss/      Uptime: 11 hours, 42 mins
  +ssssssssshmydMMMMMMMNddddyssssssss+     Packages: 862 (dpkg)
 /sssssssshNMMMyhhyyyyhmNMMMNhssssssss/    Shell: zsh 5.8
.ssssssssdMMMNhsssssssssshNMMMdssssssss.   CPU: Intel i7-10510U (8) @ 2.304GHz
+sssshhhyNMMNyssssssssssssyNMMMysssssss+   Memory: 170MiB / 7961MiB
ossyNMMMNyMMhsssssssssssssshmmmhssssssso
ossyNMMMNyMMhsssssssssssssshmmmhssssssso
+sssshhhyNMMNyssssssssssssyNMMMysssssss+
.ssssssssdMMMNhsssssssssshNMMMdssssssss.
 /sssssssshNMMMyhhyyyyhdNMMMNhssssssss/
  +sssssssssdmydMMMMMMMMddddyssssssss+
   /ssssssssssshdmNNNNmyNMMMMhssssss/
    .ossssssssssssssssssdMMMNysssso.
      -+sssssssssssssssssyyyssss+-
        `:+ssssssssssssssssss+:`
            .-/+oossssoo+/-.
```
