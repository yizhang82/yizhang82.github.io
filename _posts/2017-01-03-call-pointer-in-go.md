---
layout: post
title:  "Calling C functions from GO"
date:   2017-01-03
description: How to call C functions from GO 
comments: true
categories:
- go
- interop
---
I've recently started learning GO and given that I've spent majority of my career in interop between runtimes and languages, I'm naturally curious on how you can interop between GO and other languages. It is most important to have the two functionality below:
* retrieve a native function pointer
* call the native function pointer with arguments and receive values back

I understand that you can use cgo to call into C functions, but with the above building blocks at hand, you can practically build anything, such as calling into COM functions, interop with arbitary languages, as long as they export their functionality via function pointers or library exports. Either way, after some research, I stumbled upon the syscall package. It is providing exactly what I need - supporting things like LoadLibrary/getProcAddress, and providing function to call a native function pointer.

The following code does something very straight-forward - load kernel32.dll (which should already be mapped into the process, for every Windows process), retrieve GetModuleFileNameW from the DLL, and call it with supplied arguments.
 
One thing worth pointing out is how to correctly supply a native buffer to GetModuleFileNameW as a LPTSTR. It is fairly straight-forward to create a uint16 slice with the right size MAX_PATH, but for some reason you need to explicitly use Unsafe.Pointer(&slice[0]) to retrieve the address of the first element explicitly. If you simply pass &slice, it'll corrupt the reference and cause a panic later.

```go

package main

import (
	"fmt"
	"log"
	"syscall"
	"unsafe"
)

func main() {
	handle, err := syscall.LoadLibrary("kernel32.dll")
	if err != nil {
		log.Fatal(err)
		return
	}

	proc, err := syscall.GetProcAddress(handle, "GetModuleFileNameW")
	if err != nil {
		log.Fatal(err)
	}

	maxLen := 255
	fileName := make([]uint16, maxLen)

	// The trick here is to use &fileName[0] to get the address of the first element
	// &fileName would corrupt the variable
	syscall.Syscall(proc, uintptr(3), uintptr(0), uintptr(unsafe.Pointer(&fileName[0])), uintptr(len(fileName)))

	fmt.Printf("GetModuleFileNameW returns \"%v\".", syscall.UTF16ToString(fileName))
}
```

A cursory look seems to suggest that all these are implemented using cgocall (used by cgo internally) which essentially send the args over to an assembly helper. My next post is probably going to be comparing this with p/invokes and see what is the performance difference. Thanks for reading!

