---
layout: post
title:  "Getting GDB to work on Mac OS X Mojave"
description: "How to get GDB to work on MacOSX Mojave"
permalink: get-gdb-to-work-on-mojave
comments: true
excerpt_separator: <!--more-->
categories:
- gdb 
- mac 
- tips 
---

Starting from Mac OS X 10.5 (Leopard), Apple starts to lock down the system further and debuggers like GDB now have to be code signed. There is a [great article](https://sourceware.org/gdb/wiki/PermissionsDarwin) describing steps to get it to work. However, there are a lot of conflicting information on the web and people are having trouble with some of those instructions, myself included. So I'd like to document what I did to get it to work, and highlight the issues I ran into:

On a high-level you need to perform these steps:

1. You need to create a certificate in System Keychain that is self-sign and always trust for code signing
2. Sign the GDB binary with the certificate. Include proper entitlements if you are on 10.14+.
3. Reboot

The article has detailed steps on these steps so I'm not going to repeat them.

A few gotchas that I ran into myself:

1. If you see this error complaining about code signing even though you had signed the GDB executable:

```
Starting program: /Users/yzha/github/mysql-server/debug/runtime_output_directory/mysqld
Unable to find Mach task port for process-id 55009: (os/kern) failure (0x5).
 (please check gdb is codesigned - see taskgated(8))
```

Double check if you had the proper entitlements in a XML file and pass to codesign when you are signing GDB. Many articles on the web in fact didn't have the entitlement step as it likely is a new requirement 10.14+. 

2. If you are seeing this error even if you had signed with proper entitlements:

```
During startup program terminated with signal ?, Unknown signal.
```

Make sure you stay off GDB 8.2! Upgrade to 8.3 or downgrade to 8.0.
