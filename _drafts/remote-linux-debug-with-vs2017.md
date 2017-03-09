
I was looking at LLDB/LLVM these days and debugging in commandline isn't very pleasant. Tried building LLVM/LLDB trunk on windows but the PDB/DWARF support seems to be broken. VS Code on Mac works to some extent, but always getting stuck in certain method calls. Getting a bit frustrated, I turned to Visual Studio 2017 and tried to get remote debugging to work. I first tried to get it work on my MBP, and Apple being always Apple, making this giant pain. After follow some posts to install GDB through homebrew and codesign GDB, remote debugging still doesn't work. Then I turned to my Ubuntu box, and was able to get it work after 5 mins. 

First, you need to install opensshserver:

```
sudo apt-get install openssh-server
```

You probably already have it if you use SSH to connect to your ubuntu box. 

I also find it necessary to change the default ptrace scope to 0 following [this wiki](https://github.com/Microsoft/MIEngine/wiki/Troubleshoot-attaching-to-processes-using-GDB). You just need to type this command:

```
echo "0" | sudo tee /proc/sys/kernel/yama/ptrace_scope
```

Now back to the windows box where I got a local LLVM repo. After doing Cmake, I have a good .sln that I can open and navigate. You don't need this for remote debugging, but it is certainly make the whole process very nice (setting breakpoints, navigating code, etc).

Then open VS 2017 (with or without your solution), and goto Debug/Attach to Process...,

![remote](/assets/images/remote-dbg-2.png)

Make sure you pick SSH, and put your host name/IP. You should be able to see all the process in the box, including the target process (in this case, lldb) that you would like to debug. For debug engine, you can choose GDB(Native). And now attach!

![remote](/assets/images/remote-dbg-1.png)

It is amazing to see VS debugging code on a linux box - this is something that I didn't expect to see if you ask me a few years ago.
