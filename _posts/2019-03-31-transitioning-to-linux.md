---
layout: post
title:  "Byebye Windows - going full linux"
description: Going linux full time
permalink: byebye-windows
comments: true
excerpt_separator: <!--more-->
categories:
- tools
- os
- linux
- mac
- windows
- productivity
---

In my new job, no one cares about windows.

Every single developer (with a few exceptions) use MacBook Pro, and connect to their linux VM to get work done. Some people have the trash can MacPro. You get the idea. Being in Microsoft for ~12 years, this is admittingly a interesting adventure. Even though in several Microsoft projects in the past that I have been working on had linux versions (CoreCLR, Service Fabric, etc), most development is still done in Windows, and then ported to Linux/Mac. Whenever occasionally you wonder into the no-man's land in Linux where the *project* tooling / infrastructure is falling significantly behind, you want to pull your hair out. Not Linux's fault - but a matter of priority. In some extreme cases you'd wonder how even one can put out a linux version out at all.

Not anymore. Now linux (or Mac, if you count that in) is *the* full time job. 

After a few weeks of research and practice, I've been happyily chugging along with TMUX + VIM + MOSH with my custom key bindings. In this article I'll talk about a bit of my experience of making the transition.

## I miss Visual Studio

Let's get this one out of the way first. There is *no* replacement for Visual Studio. Period. The code completion (or Intelli-Sense) and debugging is simply unmatched by anything else in the market. VS Code is awesome in terms of just browsing code and doing some occasional debugging, but for writing code it is just OK as the "inteli-sense" (forgive my Microsoft VS Jargon) can be a hit or miss. Vim is good for text editing, and with plugins you can get some basic stuff to work, but again it's no where near the quality of experience of Visual Studio. Usually it's a love/hate relationship with Visual Studio - it's kinda slow and some times buggy, but you can't live without it. Well, you can, but you don't want to. 

Nowadays I use vim or VS Code / Atom for writing code, and gdb for debugging.

## Debugging using GDB is fine

Being an reasonably experienced WinDbg user, Gdb's command line taking a bit getting used to, but that's about it. GDB also supports a TUI mode that shows the integrated text window for source/register/etc and a command window. It's not great as many simple key bindings stop working in that mode (taken over by the TUI component) but as long as I can see a source code "window" over SSH I'm happy.

## TMUX is awesome

TMUX is a terminal multiplexer. With TMUX you won't lose your working state - even if you disconnect from SSH, just 'tmux attach' you'll resume where you left off. In this sense it is equivalent to a Windows Remote Desktop session. 

The most powerful part is that it also allow you to break the terminal into multiple panes and windows, and this way you don't have to leave the terminal and can easily switch between many different tasks with quick shortcuts. No more need to manage windows - everything is within the terminal. It's like a virtual desktop for terminals. It's build in the way that you barely had to touch the mouse anymore. Well, until you move to the browser, that is. 

## VIM ftw

In my Microsoft job I use vim for simple editing purposes, and I like the vim way of thinking so much that I put all my editors into vim mode / vim plugin / vim key bindings.  These days I found myself spending even more time in vim over SSH and so I invested more time finding better VIM configurations and plugins. 

I use [junegunn/vim-plug](https://github.com/junegunn/vim-plug) as my VIM plugin manager. It's pretty minimal and gets the job done. 

This is the list of plugins I use:

* [Command-T](https://github.com/wincent/command-t) - blazing fast fuzzy file finder
* [delimitMate](https://github.com/Raimondi/delimitMate) - automaticlly inserting delimiters such as (), [], etc
* [ack](https://github.com/mileszs/ack.vim) - text search tool
* [vim-gitgutter](https://github.com/airblade/vim-gitgutter) - shows in leftmost column where are the git changes using +/-/~
* [vim-fugitive](https://github.com/tpope/vim-fugitive) - great git command wrappers
* [vim-easytags](https://github.com/xolox/vim-easytags) - automated tag generation and syntax highlighting. I found the syntax highlighting can cause performance issue in large files so I turne the syntax highlighting off.
* [vim-tmux-navigator](https://github.com/christoomey/vim-tmux-navigator) - navigate between vim and tmux like they are integrated
* [a](https://github.com/vim-scripts/a.vim) - switch between header and source. Enough said.
* [tcomment_vim](https://github.com/tomtom/tcomment_vim) - toggle comment/uncomment for lines
* [vim-surround](https://github.com/tpope/vim-surround) - easy change/add surround characters like (), [], {}
* [nerdtree](https://github.com/scrooloose/nerdtree) - navigate file/directory tree
* [vim-nerdtree-tabs](https://github.com/jistr/vim-nerdtree-tabs) - making nerd-tree like an integrated panel
* [vim-better-whitespace](https://github.com/ntpeters/vim-better-whitespace) - highlight trailing whitespace characters. They are annoying for sure and lint warns about them
* [lightline](https://github.com/itchyny/lightline.vim) - a light and configurable status line for vim
* [goyo](https://github.com/junegunn/goyo.vim) - distraction free writing. Best for writing docs

## SSH is the old Remote Desktop

In my old job I usually "remote" into my development machines at office - and "remote" means "Windows Remote Desktop". In a reasonable connection it is actually quite nice - there is little lag and you almost feel you are working on a local machine, with all the graphical UI - it's really amazing.

With linux, you fallback to the good old text-based SSH. It's kinda amazing in its own way that you can have text-based remote protocol for complicated full screen programs like vim. You don't get graphical UI this way - but for the most part you don't need to, and it's usually blazing fast. 

Mosh improves over SSH that it is async (doesn't wait for server response) so it feels even more responsive. The trade-off is that it can get a bit jarring when you type something and it does't react correctly initially.

## Shell matters 

Windows Commmand Prompt is fine. It works. I still remember I learned my first DOS commands at a 33MHZ 386DX. But it hadn't changed much since then. ConEmu is a popular terminal and some people (especally admins) use PowerShell as well. But none of those match the flexiblity of linux shells - they just have so much more to offer. You can switch between different shells, adding customizations, even plugins. 

For now I'm using ZSH with [oh-my-zsh](https://github.com/robbyrussell/oh-my-zsh). It has fantastic themes and plugins. My favorite features are:
* Plugins that shows me all kind of status, such as git status, any pending background process, how long the last command took, etc. 
* Auto-suggestion. It automatically suggest the full command based on best match and it grays out the rest of the command that you didn't type. It's simple but almost feels like magic when you see it for the first time in action. 
* Syntax highlighting. Enough said.
* VIM editing. Yes, you can now use VIM commands to edit your shell commands. Just think that you can easily navigate with all the muscle memory you had with vim. This *should* be mandatory in every thing that deal with text editing. 

With all these, and throw in a few custom key bindings, the plain shell / windows command prompt just seems so boring.

## You need to work on your configurations

However, tweaking these tools so that they work for you takes time. I find myself spending quite a bit of time tweaking the configurations to make it work better for me - and the time spent paid off. All the different configuration options are indeed quite overwhelming if starting from scratch so I use [Awesome dotfiles](https://github.com/Parth/dotfiles) project as my starting point for tweaking and forked my own version [yizhang82/dotfiles](https://github.com/yizhang82/dotfiles). There are a lot of things that I like about the way the things are setup:
  * One script to deploy everything - TMUX/ZSH, the entire github repo containing dotfiles, and back them up
  * Dotfiles are configured to include the settings/scripts from the repo at `~/dotfiles` - this way things can be automatically synchronized through a git pull. This is actually quite brilliant.  
  * Automatically pulls the github repo every time ZSH starts - so it's always up to date

Of course, many of the configurations there are already pretty good and is perfect as a starting point for my own configurations. 

It contains all my TMUX, ZSH, VIM configurations, and by simplying cloning and running a script it goes into a new machine effortlessly. Most of these is done by the original author and I'm simply tweaking it to my needs.

## I like it

It did take a bit getting used to, but I'm happy to report that I now feel very much productive roughly on the same level of productivity when I'm working on Windows (if not more). I do miss having a fully integrated Visual Studio experience, but the command line experience (with TMUX, etc) in Linux is so much better that it more than makes up for that. Of course, at the end of the day, what matters is getting the job done - just use the right tool for the job. In a future post I can get into a bit more details with my experience with these tools and share some of my learnings/tips. 

P.S. I still use Windows at home. I have custom built (by myself) PC that has i7 4770K, 32G RAM, nVidia 2080 RTX mostly for gaming. I think Windows has mostly lost the mindshare of developers these days, but it's still *the* OS for gamers, and will be for quite some time. 

