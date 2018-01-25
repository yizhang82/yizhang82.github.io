---
layout: post
title:  "Dogfooding .NET Standard 2.0 latest build"
date:   2017-03-18
categories:
- C#
- interop
- netcore
- dotnet
permalink: dogfooding-netstandard-2
comments: true
description: Walk through steps to dogfood netstandard 2.0 with a sample using ICustomMarshaler
---  
If you've been following .NET Core development you've probably already heard about .NET Standard 2.0. We are bringing back a lot of APIs from desktop to .NET Core to make migrating existing apps easier. If you'd like to read more about what is netstandard, you can refer to this [faq](https://github.com/dotnet/standard/blob/master/docs/faq.md). In this post I'm going to show you how to dogfood (read: try out the bleeding edge new stuff) the latest .NET Core 2.0 which has the latest API changes in .NET Standard 2.0. 

First, download one of the tarballs from below:

- [Win 64-bit Latest Zip](https://dotnetcli.blob.core.windows.net/dotnet/Sdk/master/dotnet-dev-win-x64.latest.zip) [Installer](https://dotnetcli.blob.core.windows.net/dotnet/Sdk/master/dotnet-dev-win-x64.latest.exe)
- [macOS 64-bit Latest Tar](https://dotnetcli.blob.core.windows.net/dotnet/Sdk/master/dotnet-dev-osx-x64.latest.tar.gz) [Installer](https://dotnetcli.blob.core.windows.net/dotnet/Sdk/master/dotnet-dev-osx-x64.latest.pkg)
- [Others](https://github.com/dotnet/cli/blob/master/README.md#installers-and-binaries)

If you use the installer, it will overwrite your existing .NET Core installation, which is probably not what you want. The easier way is to simply extract it. Here I've downloaded the macOS 64-bit version, and extracted it to ~/dotnet-dev-osx-x64.latest. 

You'll quickly notice that the folder has dotnet, a SDK folder containing tools (for example, Roslyn compiler `sdk/2.0.0-preview1-005448/Roslyn/csc.exe`), a shared folder containing the runtime (`shared/Microsoft.NETCore.App/2.0.0-beta-001776-00/libcoreclr.dylib`) and implementation assemblies, etc. To confirm that you've downloaded the correct tools, just run:

```
yizhang@yzha-mbp:~/var/ns2$ ~/dotnet-dev-osx-x64.latest/dotnet --version
2.0.0-preview1-005448
```

You should see 2.0.0-\*. 

To try out the new APIs, you need to first create a new project using the console application template:

```
yizhang@yzha-mbp:~/var/ns2$ ~/dotnet-dev-osx-x64.latest/dotnet new console
Content generation time: 49.1374 ms
The template "Console Application" created successfully.
```

One of the new API we've bought back is System.Runtime.InteropServices.ICustomMarshal. Well, I'm a bit biased since I've spent most of my career working with .NET interop. To try this out, I've copy/pasted some code from Mono.Posix (and removed some dependencies), and it just worked:

```csharp


using System.Runtime.InteropServices;

class Unsafe
{
    class StringMarshaler : ICustomMarshaler {

        private static StringMarshaler Instance = new StringMarshaler ();

        public static ICustomMarshaler GetInstance (string s)
        {
            return Instance;
        }

        public void CleanUpManagedData (object o)
        {
        }

        public void CleanUpNativeData (IntPtr pNativeData)
        {
            Marshal.FreeCoTaskMem(pNativeData);
        }

        public int GetNativeDataSize ()
        {
            return IntPtr.Size;
        }

        public IntPtr MarshalManagedToNative (object obj)
        {
            string s = obj as string;
            if (s == null)
                return IntPtr.Zero;
            IntPtr p = Marshal.StringToCoTaskMemAnsi(s);
            return p;
        }

        public object MarshalNativeToManaged (IntPtr pNativeData)
        {
            string s = Marshal.PtrToStringAnsi(pNativeData);
            return s;
        }
    }

    [DllImport ("libc", EntryPoint="mkdir", SetLastError=true)]
    internal extern static int syscall_mkdir ([MarshalAs(UnmanagedType.CustomMarshaler, MarshalTypeRef=typeof(StringMarshaler))] string pathname, int mode);
}

class Program
{
    static void Main(string[] args)
    {
        Unsafe.syscall_mkdir("test", 0);
        Console.WriteLine("test directory created");
    }
}
```

This program simply uses a custom marshaler that marshal a string to UTF-8 using Marshal.StringToCoTaskMemAnsi. It's a bit overkill since string is marshaled as UTF-8 by default, but this is a demo to show the new API - you got the idea. 

Now do a `~/dotnet-dev-osx-x64.latest/dotnet restore` then `~/dotnet-dev-osx-x64.latest/dotnet run`. And see the new directory getting created. 

