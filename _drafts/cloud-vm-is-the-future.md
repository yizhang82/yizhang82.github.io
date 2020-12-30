# Future of the developer's desktop / laptop is the cloud

In my previous job, I had a DELL workstation, and when it times to upgrade at probably 2016/2017, our team got RAM for everybody and I was trying to install it. I build my own PC so I was perfectable capable of installing a RAM, but the DELL workstation just plain refused the RAM, and started beeping. I tried to install the RAM in different slots and different combinations, and to no success. People started heard the noise and come to look to see what's going on, and found me sweating under the desk and cursing. At that point I really wished our dev machines are in the cloud, in a data center somewhere.

In my current job, everybody has a laptop and the real work is done at a cloud VM that is really powerful. We just SSH to it, clone our repo, and it does all the heavy lifting. If the VM dies, we just get another VM, clone the code there, and move on with life. 

## Why isn't the future is here now?

* IDE is still not quite remote friendly.
* Some development still has to be done locally - such as mobile development, hardware development, etc
* Sometimes you want to work offline
* Cost of a VM is still too high for regular people - unless you got it from work.

## Is the next year the year of linux desktop?

It'll probably never be. Linux desktop is still fragmented as ever, and it'll probably never get the kind of investment / polish a commercial OS like Windows / Mac will get. But that's probably OK. When development machines move completely to the cloud, it doesn't matter anyway. All you need is a stable connection and terminal client that supports SSH.


