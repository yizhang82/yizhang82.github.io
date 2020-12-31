---
layout: post
title:  "Fedora 33 Workstation on X1 Carbon 7th gen"
permalink: fedora-linux
comments: true
excerpt_separator: <!--more-->
categories:
- linux
---

I've had a Lenovo X1 Carbon 7th Gen for a while and tried putting Ubuntu 20.04 on it, but had quite a bit of trouble. Mostly the problem was this model has 4 speakers (two front and two bottom) so linux had quite a bit of trouble with it. The sound was tinny, and volume up / down doesn't work either. The microphone jack also pops. There are other minor issues like finger print sensor doesn't work, though I don't care about it much. There is [a long thread](https://forums.lenovo.com/t5/Ubuntu/Guide-X1-Carbon-7th-Generation-Ubuntu-compatability/td-p/4489823?page=1) discussing problems with ubuntu. I spend quite a while browsing forums and find some work arounds, but none are satisifactory. So I gave up and [went WSL2](/set-up-wsl2).

WSL2 is basically a VM, so it works mostly quite well and is indistinguishable from a native linux, for the most part. However, it isn't quite smooth sailing either. It is still quit a bit slower. For example, starting vim takes a second or so while in native linux it is pretty much instant. It is also very memory hungry - it seems that it aggressively will take over all memory for I/O cache, usually not a problem if it were the only game in town, but it would slow down Windows as a result. I have a desktop machine with 32G and it'll happily push it over 80% in a memory intensive task such as compilation. Capping the memory consumption helps, though.

After a while I've heard [Lenovo has been working with Fedora for ThinkPads](https://www.forbes.com/sites/jasonevangelho/2020/05/08/lenovo-has-2-awesome-surprises-for-linux-thinkpad-customers-in-2020/?sh=404aaf72399d), but didn't get a chance to try it out yet, until this week. I'm happy to report that putting Fedora Workstation 33 x64 works pretty much perfectly:
* Wifi works out of the box
* Suspend/Resume works fine - Lenovo seems to suggest the keep the sleep state in BIOS to Windows as Linux supports it these days
* Audio works fine - all 4 speakers seems to work and microphone works well as well. Volumn buttons work as well
* Camera works - a must these days for meetings
* Trackpad works - not quite as smooth as Windows but acceptable. Scrolling was a bit too fast for my liking and it looks like there isn't a great way to tweak it in Gnome. But I can live with it
* Fingerprint Sensor works - I didn't even realize I need it but it even works for `sudo`, which is a pleasant surprise:

![Fingerprint Sensor for sudo](/imgs/lenovo-fedora-1.png)

However, it did come with a catch. If I login with fingerprint, it'll still ask me to unlock the keyring using password, which is broken for sure. Also the fingerprint daemon seems to be occasionally stop working and hang at the shutdown (until timeout), but either way using fingerprint for sudo is kinda nice so I'm ok with living with it. 

One thing that annoyed me is the "task bar" won't show up until I hover mouse to the top-left. Using [Dash to Dock](https://extensions.gnome.org/extension/307/dash-to-dock/) fixed that.

Putting the software I need on it is also relatively straight-forward. I have [dotfiles](https://github.com/yizhang82/dotfiles) that install vim/tmux/zsh for me and [install.sh](https://github.com/yizhang82/utils/blob/master/sys/linux/install.sh) install all the utilities - I did have to adapt it to use dnf and some libraries need different names, but that's pretty much it. Once installing VS Code and Chrome I'm good to go. I did run into a problem with Chrome 2nd window being super slow which seems to be a problem with wayland. Applying [a fix from stackoverflow post](https://unix.stackexchange.com/questions/612325/opening-two-chrome-windows-on-fedora-32-is-very-slow) fixed it for me.

Overall I'm quite happy with Fedora 33 on X1 Carbon 7th Gen. Linux has certainly came a long way and it's great to see hardware manufacturers collaborating with Linux making the experience just work, so there are still hope. Unfortunately Linux desktop is still fragmented as ever, so maybe the year of linux desktop won't be quite there yet. Maybe we'll all end up with Chrome books and SSH to our dev boxes in the cloud - not quite there yet but not that far away either.


