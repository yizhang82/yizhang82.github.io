---
layout: post
title:  "C# Process and StartInfo - fun investigating a strange InvalidOperationException and the dilemma of compat"
description: 
permalink: process-startinfo
comments: true
excerpt_separator: <!--more-->
categories:
- dotnetcore
- dotnet
- csharp
- api
- design
- investigation
---

## The tale of InvalidOperationException

This came up when I was helping someone looking into a strange issue. Recently some process dump capture tool started throwing InvalidOperationException:

```
Unhandled Exception: System.InvalidOperationException: Process was not started by this object, so requested information cannot be determined.
   at System.Diagnostics.Process.get_StartInfo()
   at SomeTestUtility.WaitForSomeProcessToExit()
```

<!--more-->

The code looks fairly straight-forward:

```csharp

    Process[] allProcess = Process.GetProcesses().Where(p => p.ProcessName.Contains("SomeInterestingProcess"));  
    foreach (var p in allProcess)
    {
        Console.WriteLine(p.StartInfo.FileName);
    }

```

The original author claims the code haven't changed in a year and was working perfectly before. I mostly believe him but something must have changed. The best way to find out what happened is to look at the source code.

Looking at the code in [Process.cs](https://github.com/dotnet/corefx/blob/dev/release/2.0.0/src/System.Diagnostics.Process/src/System/Diagnostics/Process.cs) in .NET Core 2.0:

```csharp
        public ProcessStartInfo StartInfo
        {
            get
            {
                if (_startInfo == null)
                {
                    if (Associated)
                    {
                        throw new InvalidOperationException(SR.CantGetProcessStartInfo);
                    }

                    _startInfo = new ProcessStartInfo();
                }
                return _startInfo;
            }
        }
```

The code would've thrown if it is not `Associated`. And `Associated` simply means there is a process id / process handle associated:

```csharp
        bool Associated
        {
            get { return _haveProcessId || _haveProcessHandle; }
        }
```

For process that returned from Process.GetProcesses(), they are constructed using this ctor:

```
        private Process(string machineName, bool isRemoteMachine, int processId, ProcessInfo processInfo)
        {
            GC.SuppressFinalize(this);
            _processInfo = processInfo;
            _machineName = machineName;
            _isRemoteMachine = isRemoteMachine;
            _processId = processId;
            _haveProcessId = true;
            _outputStreamReadMode = StreamReadMode.Undefined;
            _errorStreamReadMode = StreamReadMode.Undefined;
        }
```

See that `_haveProcessId = true`. So this clearly would've never worked. 

However, being a ex-.NET guy, I know something had to be up. I tried this in full .NET (aka, .NET desktop) and in .NET Core, and viola:

* .NET desktop 4.6.1: prints empty string
* .NET Core 2.0: InvalidOperationException

A little bit of search reveals https://github.com/dotnet/corefx/issues/1100. Interestingly, the EnvironmentVariable case is more bizzar - it actually prints out the environment variable for current process! Someone is really trying hard to make it work...

## What Happened?

If you think about from the perpsective of the API implementor for `Process` class, it's actually not hard to imagine the dilemma here. The original API design exposing `StartInfo` in process is actually a not a great choice, in my opinion.

If you look at the [CreateProcess](https://docs.microsoft.com/en-us/windows/desktop/api/processthreadsapi/nf-processthreadsapi-createprocessa) API doc in MSDN, you'll see that StartInfo is basically arguments passed to CreateProcess, and many of them aren't available for process APIs with HANDLE that you got from OpenProcess / EnumProcess API. So the implementor had to give them the best effort or simply gave up and lie about it. With .NET Core they made a choice to throw `InvalidOperationException` instead. 

While arguably this is a bit contraversial, in most cases people would quickly realize StartInfo can't be relied on (many properties came back empty) and would steer clear of it. So it's not too bad. But there are obviously still cases people might mistakenly use the incorrect value, and the code might work accidently. The choice is either be compatible and give people the incorrect behavior, or throw `InvalidOperationException` that people would know it can't be relied on (however you can't change the API shape now - too bad). The compat option is not great as it allow people to keep writing bad code, but throwing exception means potentially breaking (incorrect) code. Usually I'd vote for compat but in this case I think going with the breaking change is the right choice going forward. It'll break some not-so-great code and hopefully that's a relatively small occurrence.

what do you think?

Spoiler alert: Next time I'll write about another fun one - Environment.SetEnvironmentVariable doesn't actually set the environment variable.
