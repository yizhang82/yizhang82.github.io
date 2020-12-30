---
layout: post
title:  "Moving to Fedora 33"
permalink: fedora-linux
comments: true
excerpt_separator: <!--more-->
categories:
- linux
---

I've had a Lenovo X1 Carbon 7th Gen for a while and tried putting Ubuntu 20.04 on it, but had quite a bit of trouble. Mostly the problem was this model has 4 speakers (two front and two bottom) so linux had quite a bit of trouble with it. The sound was tinny, and volume up / down doesn't work either. The microphone jack also pops. There are other minor issues like finger print sensor doesn't work, though I don't care about it much. There is [a long thread](https://forums.lenovo.com/t5/Ubuntu/Guide-X1-Carbon-7th-Generation-Ubuntu-compatability/td-p/4489823?page=1) discussing problems with ubuntu. I spend quite a while browsing forums and find some work arounds, but none are satisifactory. So I gave up and [went WSL2](/set-up-wsl2).

WSL2 is basically a VM, so it works mostly quite well and is indistinguishable from a native linux, for the most part. However, it isn't quite smooth sailing either. It is still quit a bit slower. For example, starting vim takes a second or so while in native linux it is pretty much instant. It is also very memory hungry - it seems that it aggressively will take over all memory for I/O cache, usually not a problem if it were the only game in town, but it would slow down Windows as a result. I have a desktop machine with 32G and it'll happily push it over 80% in a memory intensive task such as compilation. Capping the memory consumption helps, though.

After a while I've heard [Lenovo has been working with Fedora for ThinkPads](https://www.forbes.com/sites/jasonevangelho/2020/05/08/lenovo-has-2-awesome-surprises-for-linux-thinkpad-customers-in-2020/?sh=404aaf72399d), but didn't get a chance to try it out yet, until this week. I'm happy to report that putting Fedora Workstation 33 x64 works pretty much perfectly:
* Audio works fine - all 4 speakers seems to work and microphone works well as well. Volumn buttons work as well
* Camera works - a must these days for meetings
* Trackpad works - not quite as smooth as Windows but acceptable. Scrolling was a bit too fast for my liking and it looks like there isn't a great way to tweak it in Gnome. But I can live with it
* Fingerprint Sensor works - I didn't even realize I need it but it even works for `sudo`, which is a pleasant surprise:

![Fingerprint Sensor for sudo](/imgs/lenovo-fedora-1.png)

> Though it seems to cause occasional hangs at shutdown and may random stop working, but hey, I'm not going to complain too much.
