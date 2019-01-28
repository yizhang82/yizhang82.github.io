---
layout: post
title:  "Byebye Windows - making the transition into linux-only"
description: How to version your structs the right way
permalink: version-structs
comments: true
excerpt_separator: <!--more-->
categories:
- tools
- os
- linux
- mac
- windows
---

In my new job, no one cares about windows.

Every single developer (with a few exceptions) use MacBook Pro, and connect to their linux VM to get work done. Some people have the trash can MacPro. You get the idea. Being in Microsoft for ~12 years, this is admittingly a interesting adventure. Even though in several Microsoft projects in the past that I have been working on had linux versions (CoreCLR, Service Fabric, etc), most development is still done in Windows, and occasionally you wonder into the no-man's land in Linux where the *project* tooling / infrastructure is falling significantly behind. In some extreme cases you'd wonder how even one can put out a linux version out at all.

Not anymore. Now linux (or Mac, if you count that in) is *the* full time job. 

After a few weeks of research, now I'm happyily chugging along with TMUX + VIM + MOSH with my custom key bindings. In this article I'll talk about a bit of my experience of making the transition.

## I miss Visual Studio

Let's get this one out of the way first. There is *no* replacement for Visual Studio. Period. VS Code is awesome in terms of just browsing code and doing some occasional debugging, but for writing code it is just OK. There is simply no good inteli-sense and debugging support anywhere else that matches Visual Studio. Usually it's a love/hate relationship with Visual Studio - it's kinda slow and some times buggy, but you can't live without it. Well, you can, but you don't want to. 

# TMUX is awesome



# VIM ftw

In my Microsoft job I use vim for simple editing purposes, and I like the vim way of thinking so much that I put all my editors into vim mode / vim plugin / vim key bindings.  These days I found myself spending even more time in vim over SSH and so I invested more time finding better VIM configurations and plugins. 

This is the list of plugins I use:

* [Command-T](wincent/command-t) - blazing fast fuzzy file finder
* [delimitMate](Raimondi/delimitMate) - automaticlly inserting delimiters such as (, [, etc
* [ack](mileszs/ack.vim)
* [vim-gitgutter](airblade/vim-gitgutter)
* tpope/vim-fugitive
* xolox/vim-easytags'
* christoomey/vim-tmux-navigator
* vim-scripts/a.vim
* tomtom/tcomment_vim
* tpope/vim-surround
* scrooloose/nerdtree
* jistr/vim-nerdtree-tabs
* ntpeters/vim-better-whitespace
* itchyny/lightline.vim
* junegunn/goyo.vim

# Shell matters 

Windows Commmand Prompt is fine. It works. I still remember I learned my first DOS commands at a 33MHZ 386DX. But it hadn't changed much since then. Meanwhile linux shells has so much more to offer - you can switch between different shells, adding customizations, even plugins. 

For now I'm using ZSH with [oh-my-zsh](https://github.com/robbyrussell/oh-my-zsh). It has fantastic themes and plugins. My favorite features are:
* Plugins that shows me all kind of status, such as git status, any pending background process, how long the last command took, etc. 
* Auto-suggestion. It automatically suggest the full command based on best match and it grays out the rest of the command that you didn't type. It's simple but almost feels like magic when you see it for the first time in action. 
* Syntax highlighting. Enough said.
* VIM editing. Yes, you can now use VIM commands to edit your shell commands. Just think that you can easily navigate with all the muscle memory you had with vim. Admittingly it takes some getting used to because it is not easy to tell which mode you are in. I might spend a bit more time to see if this can be tweaked.  

With all these, and throw in a few custom key bindings, the plain shell / windows command prompt just seems so boring.

# You need to work on your configurations

I find myself spending far more time tweaking the configurations to make it work better for me - and the time spent paid off. All the different configuration options are indeed overwhelming so I use [Awesome dotfiles](https://github.com/Parth/dotfiles) project as my starting point for tweaking and forked my own version [yizhang82/dotfiles](https://github.com/yizhang82/dotfiles). There are a lot of things that I like about the way the things are setup:
  * One script to deploy everything - TMUX/ZSH, the entire github repo containing dotfiles, and back them up
  * Dotfiles are configured to include the settings/scripts from the repo at `~/dotfiles` - this way things can be automatically synchronized through a git pull 
  * Automatically pulls the github repo every time ZSH starts - so it's always up to date

Of course, many of the configurations there are already pretty good and is perfect as a starting point for my own configurations. 

It contains all my TMUX, ZSH, VIM configurations, and by simplying cloning and running a script it goes into a new machine effortlessly. Most of these is done by the original author and I'm simply tweaking it to my needs.
