
# typeof magic


```cs

    class Foo<T>
    {
        public void Func()
        {
            Console.WriteLine(typeof(T));
        }
    }

```

```cpp

enum CORINFO_RUNTIME_LOOKUP_KIND
{
    CORINFO_LOOKUP_THISOBJ,
    CORINFO_LOOKUP_METHODPARAM,
    CORINFO_LOOKUP_CLASSPARAM,
};

```

```
0:000> !U /d 00007fff04ff0910
Normal JIT generated code
TypeOfTest.Foo`1[[System.__Canon, System.Private.CoreLib]].Func()
Begin 00007fff04ff0910, size 9c

C:\Users\ATField\Documents\Visual Studio 2017\Projects\TypeOfTest\TypeOfTest\Program.cs @ 8:
>>> 00007fff`04ff0910 55              push    rbp
00007fff`04ff0911 57              push    rdi
00007fff`04ff0912 56              push    rsi
00007fff`04ff0913 4883ec50        sub     rsp,50h
00007fff`04ff0917 488d6c2460      lea     rbp,[rsp+60h]
00007fff`04ff091c 488bf1          mov     rsi,rcx
00007fff`04ff091f 488d7dc8        lea     rdi,[rbp-38h]
00007fff`04ff0923 b904000000      mov     ecx,4
00007fff`04ff0928 33c0            xor     eax,eax
00007fff`04ff092a f3ab            rep stos dword ptr [rdi]
00007fff`04ff092c 488bce          mov     rcx,rsi
00007fff`04ff092f 48894de8        mov     qword ptr [rbp-18h],rcx
00007fff`04ff0933 48894d10        mov     qword ptr [rbp+10h],rcx
00007fff`04ff0937 833daa48eaff00  cmp     dword ptr [00007fff`04e951e8],0
00007fff`04ff093e 7405            je      00007fff`04ff0945
00007fff`04ff0940 e87b2fc45f      call    coreclr!JIT_DbgIsJustMyCode (00007fff`64c338c0)
00007fff`04ff0945 90              nop

C:\Users\ATField\Documents\Visual Studio 2017\Projects\TypeOfTest\TypeOfTest\Program.cs @ 9:
00007fff`04ff0946 488b4d10        mov     rcx,qword ptr [rbp+10h]
00007fff`04ff094a 488b09          mov     rcx,qword ptr [rcx]
00007fff`04ff094d 488b4930        mov     rcx,qword ptr [rcx+30h]
00007fff`04ff0951 488b09          mov     rcx,qword ptr [rcx]
00007fff`04ff0954 488b09          mov     rcx,qword ptr [rcx]
00007fff`04ff0957 48894de0        mov     qword ptr [rbp-20h],rcx
00007fff`04ff095b 8b4de0          mov     ecx,dword ptr [rbp-20h]
00007fff`04ff095e f7c101000000    test    ecx,1
00007fff`04ff0964 750a            jne     00007fff`04ff0970
00007fff`04ff0966 488b4de0        mov     rcx,qword ptr [rbp-20h]
00007fff`04ff096a 48894dd8        mov     qword ptr [rbp-28h],rcx
00007fff`04ff096e eb0f            jmp     00007fff`04ff097f
00007fff`04ff0970 488b4de0        mov     rcx,qword ptr [rbp-20h]
00007fff`04ff0974 488b89ffffffff  mov     rcx,qword ptr [rcx-1]
00007fff`04ff097b 48894dd8        mov     qword ptr [rbp-28h],rcx
00007fff`04ff097f 488b4dd8        mov     rcx,qword ptr [rbp-28h]
00007fff`04ff0983 e868dfac5f      call    coreclr!JIT_GetRuntimeType (00007fff`64abe8f0)
00007fff`04ff0988 488945d0        mov     qword ptr [rbp-30h],rax
00007fff`04ff098c 488b4dd0        mov     rcx,qword ptr [rbp-30h]
00007fff`04ff0990 e85bbeaf5f      call    coreclr!RuntimeTypeHandle::GetTypeFromHandle (00007fff`64aec7f0)
00007fff`04ff0995 488945c8        mov     qword ptr [rbp-38h],rax
00007fff`04ff0999 488b4dc8        mov     rcx,qword ptr [rbp-38h]
00007fff`04ff099d e88efeffff      call    00007fff`04ff0830 (System.Console.WriteLine(System.Object), mdToken: 0000000006000082)
00007fff`04ff09a2 90              nop

C:\Users\ATField\Documents\Visual Studio 2017\Projects\TypeOfTest\TypeOfTest\Program.cs @ 10:
00007fff`04ff09a3 90              nop
00007fff`04ff09a4 488d65f0        lea     rsp,[rbp-10h]
00007fff`04ff09a8 5e              pop     rsi
00007fff`04ff09a9 5f              pop     rdi
00007fff`04ff09aa 5d              pop     rbp
00007fff`04ff09ab c3              ret
```

```cpp

//*******************************************************************************
// Does this method require any kind of extra argument for instantiation information?
BOOL MethodDesc::RequiresInstArg()
{
    LIMITED_METHOD_DAC_CONTRACT;

    BOOL fRet = IsSharedByGenericInstantiations() &&
        (HasMethodInstantiation() || IsStatic() || GetMethodTable()->IsValueType() || IsDefaultInterfaceMethod());

    _ASSERT(fRet == (RequiresInstMethodTableArg() || RequiresInstMethodDescArg()));
    return fRet;
}

```

0:000> !u 00007fff`04ff094d
Normal JIT generated code
TypeOfTest.Foo`1[[System.__Canon, System.Private.CoreLib]].Func()
Begin 00007fff04ff0910, size 9c

C:\Users\ATField\Documents\Visual Studio 2017\Projects\TypeOfTest\TypeOfTest\Program.cs @ 8:
00007fff`04ff0910 55              push    rbp
00007fff`04ff0911 57              push    rdi
00007fff`04ff0912 56              push    rsi
00007fff`04ff0913 4883ec50        sub     rsp,50h
00007fff`04ff0917 488d6c2460      lea     rbp,[rsp+60h]
00007fff`04ff091c 488bf1          mov     rsi,rcx
00007fff`04ff091f 488d7dc8        lea     rdi,[rbp-38h]
00007fff`04ff0923 b904000000      mov     ecx,4
00007fff`04ff0928 33c0            xor     eax,eax
00007fff`04ff092a f3ab            rep stos dword ptr [rdi]
00007fff`04ff092c 488bce          mov     rcx,rsi
00007fff`04ff092f 48894de8        mov     qword ptr [rbp-18h],rcx
00007fff`04ff0933 48894d10        mov     qword ptr [rbp+10h],rcx
00007fff`04ff0937 833daa48eaff00  cmp     dword ptr [00007fff`04e951e8],0
00007fff`04ff093e 7405            je      00007fff`04ff0945
00007fff`04ff0940 e87b2fc45f      call    coreclr!JIT_DbgIsJustMyCode (00007fff`64c338c0)
00007fff`04ff0945 90              nop

C:\Users\ATField\Documents\Visual Studio 2017\Projects\TypeOfTest\TypeOfTest\Program.cs @ 9:
00007fff`04ff0946 488b4d10        mov     rcx,qword ptr [rbp+10h]            ; this pointer
00007fff`04ff094a 488b09          mov     rcx,qword ptr [rcx]                ; MethodTable *
>>> 00007fff`04ff094d 488b4930        mov     rcx,qword ptr [rcx+30h]        ; m_pPerInstInfo
00007fff`04ff0951 488b09          mov     rcx,qword ptr [rcx]                ; first generic dictionary
00007fff`04ff0954 488b09          mov     rcx,qword ptr [rcx]                ; first type arg
00007fff`04ff0957 48894de0        mov     qword ptr [rbp-20h],rcx
00007fff`04ff095b 8b4de0          mov     ecx,dword ptr [rbp-20h]
00007fff`04ff095e f7c101000000    test    ecx,1                              ; does it have indirection?
00007fff`04ff0964 750a            jne     00007fff`04ff0970
00007fff`04ff0966 488b4de0        mov     rcx,qword ptr [rbp-20h]            ; no indirection required - load T
00007fff`04ff096a 48894dd8        mov     qword ptr [rbp-28h],rcx
00007fff`04ff096e eb0f            jmp     00007fff`04ff097f
00007fff`04ff0970 488b4de0        mov     rcx,qword ptr [rbp-20h]            ; has indirection - go get that
00007fff`04ff0974 488b89ffffffff  mov     rcx,qword ptr [rcx-1]
00007fff`04ff097b 48894dd8        mov     qword ptr [rbp-28h],rcx            
00007fff`04ff097f 488b4dd8        mov     rcx,qword ptr [rbp-28h]            ; either way rbp-28h is the type we need
00007fff`04ff0983 e868dfac5f      call    coreclr!JIT_GetRuntimeType (00007fff`64abe8f0)
00007fff`04ff0988 488945d0        mov     qword ptr [rbp-30h],rax
00007fff`04ff098c 488b4dd0        mov     rcx,qword ptr [rbp-30h]
00007fff`04ff0990 e85bbeaf5f      call    coreclr!RuntimeTypeHandle::GetTypeFromHandle (00007fff`64aec7f0)
00007fff`04ff0995 488945c8        mov     qword ptr [rbp-38h],rax
00007fff`04ff0999 488b4dc8        mov     rcx,qword ptr [rbp-38h]
00007fff`04ff099d e88efeffff      call    00007fff`04ff0830 (System.Console.WriteLine(System.Object), mdToken: 0000000006000082)
00007fff`04ff09a2 90              nop

C:\Users\ATField\Documents\Visual Studio 2017\Projects\TypeOfTest\TypeOfTest\Program.cs @ 10:
00007fff`04ff09a3 90              nop
00007fff`04ff09a4 488d65f0        lea     rsp,[rbp-10h]
00007fff`04ff09a8 5e              pop     rsi
00007fff`04ff09a9 5f              pop     rdi
00007fff`04ff09aa 5d              pop     rbp
00007fff`04ff09ab c3              ret


0:000> dt coreclr!MethodTable
   =00007fff`64ec6808 s_pMethodDataCache : (null) 
   =00007fff`64ebe154 s_fUseParentMethodData : Int4B
   =00007fff`64ebe158 s_fUseMethodDataCache : Int4B
   +0x000 m_dwFlags        : Uint4B
   +0x004 m_BaseSize       : Uint4B
   +0x008 m_wFlags2        : Uint2B
   +0x00a m_wToken         : Uint2B
   +0x00c m_wNumVirtuals   : Uint2B
   +0x00e m_wNumInterfaces : Uint2B
   +0x010 m_pParentMethodTable : Uint8B
   +0x018 m_pLoaderModule  : Ptr64 Module
   +0x020 m_pWriteableData : Ptr64 MethodTableWriteableData
   +0x028 m_pEEClass       : Ptr64 EEClass
   +0x028 m_pCanonMT       : Uint8B
   +0x030 m_pPerInstInfo   : Ptr64 Ptr64 Dictionary


```

00007fff`04ff050a 48ba8061e904ff7f0000 mov rdx,7FFF04E96180h
00007fff`04ff0514 3909            cmp     dword ptr [rcx],ecx
00007fff`04ff0516 e8bdfbffff      call    00007fff`04ff00d8

```

```


0:000> !u 00007fff`04ff1fd0 
Normal JIT generated code
TypeOfTest.Bar.Func[[System.__Canon, System.Private.CoreLib]]()
Begin 00007fff04ff1fd0, size a0

C:\Users\ATField\Documents\Visual Studio 2017\Projects\TypeOfTest\TypeOfTest\Program.cs @ 16:
>>> 00007fff`04ff1fd0 55              push    rbp
00007fff`04ff1fd1 57              push    rdi
00007fff`04ff1fd2 56              push    rsi
00007fff`04ff1fd3 4883ec50        sub     rsp,50h
00007fff`04ff1fd7 488d6c2460      lea     rbp,[rsp+60h]
00007fff`04ff1fdc 488bf1          mov     rsi,rcx
00007fff`04ff1fdf 488d7dc8        lea     rdi,[rbp-38h]
00007fff`04ff1fe3 b904000000      mov     ecx,4
00007fff`04ff1fe8 33c0            xor     eax,eax
00007fff`04ff1fea f3ab            rep stos dword ptr [rdi]
00007fff`04ff1fec 488bce          mov     rcx,rsi
00007fff`04ff1fef 488955e8        mov     qword ptr [rbp-18h],rdx
00007fff`04ff1ff3 48894d10        mov     qword ptr [rbp+10h],rcx
00007fff`04ff1ff7 48895518        mov     qword ptr [rbp+18h],rdx
00007fff`04ff1ffb 48b8e851e904ff7f0000 mov rax,7FFF04E951E8h
00007fff`04ff2005 833800          cmp     dword ptr [rax],0
00007fff`04ff2008 7405            je      00007fff`04ff200f
00007fff`04ff200a e8b118c45f      call    coreclr!JIT_DbgIsJustMyCode (00007fff`64c338c0)
00007fff`04ff200f 90              nop

C:\Users\ATField\Documents\Visual Studio 2017\Projects\TypeOfTest\TypeOfTest\Program.cs @ 17:
00007fff`04ff2010 488b4d18        mov     rcx,qword ptr [rbp+18h]           ; rdx - SECRET ARGUMENT -> InstantiatedMethodDesc *
00007fff`04ff2014 488b4910        mov     rcx,qword ptr [rcx+10h]           ; m_pPerInstInfo
00007fff`04ff2018 488b09          mov     rcx,qword ptr [rcx]               ; first type argument
00007fff`04ff201b 48894de0        mov     qword ptr [rbp-20h],rcx
00007fff`04ff201f 8b4de0          mov     ecx,dword ptr [rbp-20h]
00007fff`04ff2022 f7c101000000    test    ecx,1                             ; indirection check
00007fff`04ff2028 750a            jne     00007fff`04ff2034
00007fff`04ff202a 488b4de0        mov     rcx,qword ptr [rbp-20h]
00007fff`04ff202e 48894dd8        mov     qword ptr [rbp-28h],rcx
00007fff`04ff2032 eb0f            jmp     00007fff`04ff2043
00007fff`04ff2034 488b4de0        mov     rcx,qword ptr [rbp-20h]
00007fff`04ff2038 488b89ffffffff  mov     rcx,qword ptr [rcx-1]
00007fff`04ff203f 48894dd8        mov     qword ptr [rbp-28h],rcx
00007fff`04ff2043 488b4dd8        mov     rcx,qword ptr [rbp-28h]           ; either way it's in rbp-28h
00007fff`04ff2047 e8a4c8ac5f      call    coreclr!JIT_GetRuntimeType (00007fff`64abe8f0)
00007fff`04ff204c 488945d0        mov     qword ptr [rbp-30h],rax
00007fff`04ff2050 488b4dd0        mov     rcx,qword ptr [rbp-30h]
00007fff`04ff2054 e897a7af5f      call    coreclr!RuntimeTypeHandle::GetTypeFromHandle (00007fff`64aec7f0)
00007fff`04ff2059 488945c8        mov     qword ptr [rbp-38h],rax
00007fff`04ff205d 488b4dc8        mov     rcx,qword ptr [rbp-38h]
00007fff`04ff2061 e84a000000      call    00007fff`04ff20b0 (System.Console.WriteLine(System.Object), mdToken: 0000000006000082)
00007fff`04ff2066 90              nop

C:\Users\ATField\Documents\Visual Studio 2017\Projects\TypeOfTest\TypeOfTest\Program.cs @ 18:
00007fff`04ff2067 90              nop
00007fff`04ff2068 488d65f0        lea     rsp,[rbp-10h]
00007fff`04ff206c 5e              pop     rsi
00007fff`04ff206d 5f              pop     rdi
00007fff`04ff206e 5d              pop     rbp
00007fff`04ff206f c3              ret


```

```
0:000> dt coreclr!InstantiatedMethodDesc
   +0x000 m_wFlags3AndTokenRemainder : Uint2B
   +0x002 m_chunkIndex     : UChar
   +0x003 m_bFlags2        : UChar
   +0x004 m_wSlotNumber    : Uint2B
   +0x006 m_wFlags         : Uint2B
   =00007fff`64dd9540 s_ClassificationSizeTable : [0] Uint8B
   +0x008 m_pDictLayout    : Ptr64 DictionaryLayout
   +0x008 m_pWrappedMethodDesc : FixupPointer<MethodDesc *>
   +0x010 m_pPerInstInfo   : Ptr64 Dictionary
   +0x018 m_wFlags2        : Uint2B
   +0x01a m_wNumGenericArgs : Uint2B
```


```
00007fff`04ff051c 48b95863e904ff7f0000 mov rcx,7FFF04E96358h
00007fff`04ff0526 e8e5fbffff      call    00007fff`04ff0110
00007fff`04ff052b 90              nop

```
```

0:000> !u 00007fff`04ff2240
Normal JIT generated code
TypeOfTest.Blah`1[[System.__Canon, System.Private.CoreLib]].Func()
Begin 00007fff04ff2240, size 9f

C:\Users\ATField\Documents\Visual Studio 2017\Projects\TypeOfTest\TypeOfTest\Program.cs @ 24:
>>> 00007fff`04ff2240 55              push    rbp
00007fff`04ff2241 57              push    rdi
00007fff`04ff2242 56              push    rsi
00007fff`04ff2243 4883ec50        sub     rsp,50h
00007fff`04ff2247 488d6c2460      lea     rbp,[rsp+60h]
00007fff`04ff224c 488bf1          mov     rsi,rcx
00007fff`04ff224f 488d7dc8        lea     rdi,[rbp-38h]
00007fff`04ff2253 b904000000      mov     ecx,4
00007fff`04ff2258 33c0            xor     eax,eax
00007fff`04ff225a f3ab            rep stos dword ptr [rdi]
00007fff`04ff225c 488bce          mov     rcx,rsi
00007fff`04ff225f 48894de8        mov     qword ptr [rbp-18h],rcx
00007fff`04ff2263 48894d10        mov     qword ptr [rbp+10h],rcx
00007fff`04ff2267 48b8e851e904ff7f0000 mov rax,7FFF04E951E8h
00007fff`04ff2271 833800          cmp     dword ptr [rax],0
00007fff`04ff2274 7405            je      00007fff`04ff227b
00007fff`04ff2276 e84516c45f      call    coreclr!JIT_DbgIsJustMyCode (00007fff`64c338c0)
00007fff`04ff227b 90              nop

C:\Users\ATField\Documents\Visual Studio 2017\Projects\TypeOfTest\TypeOfTest\Program.cs @ 25:
00007fff`04ff227c 488b4d10        mov     rcx,qword ptr [rbp+10h]       ; SECRET ARGUMENT - the type
00007fff`04ff2280 488b4930        mov     rcx,qword ptr [rcx+30h]       ; m_pPerInstInfo
00007fff`04ff2284 488b09          mov     rcx,qword ptr [rcx]           ; first dict
00007fff`04ff2287 488b09          mov     rcx,qword ptr [rcx]           ; type argument
00007fff`04ff228a 48894de0        mov     qword ptr [rbp-20h],rcx
00007fff`04ff228e 8b4de0          mov     ecx,dword ptr [rbp-20h]
00007fff`04ff2291 f7c101000000    test    ecx,1
00007fff`04ff2297 750a            jne     00007fff`04ff22a3
00007fff`04ff2299 488b4de0        mov     rcx,qword ptr [rbp-20h]
00007fff`04ff229d 48894dd8        mov     qword ptr [rbp-28h],rcx
00007fff`04ff22a1 eb0f            jmp     00007fff`04ff22b2
00007fff`04ff22a3 488b4de0        mov     rcx,qword ptr [rbp-20h]
00007fff`04ff22a7 488b89ffffffff  mov     rcx,qword ptr [rcx-1]
00007fff`04ff22ae 48894dd8        mov     qword ptr [rbp-28h],rcx
00007fff`04ff22b2 488b4dd8        mov     rcx,qword ptr [rbp-28h]
00007fff`04ff22b6 e835c6ac5f      call    coreclr!JIT_GetRuntimeType (00007fff`64abe8f0)
00007fff`04ff22bb 488945d0        mov     qword ptr [rbp-30h],rax
00007fff`04ff22bf 488b4dd0        mov     rcx,qword ptr [rbp-30h]
00007fff`04ff22c3 e828a5af5f      call    coreclr!RuntimeTypeHandle::GetTypeFromHandle (00007fff`64aec7f0)
00007fff`04ff22c8 488945c8        mov     qword ptr [rbp-38h],rax
00007fff`04ff22cc 488b4dc8        mov     rcx,qword ptr [rbp-38h]
00007fff`04ff22d0 e8dbfdffff      call    00007fff`04ff20b0 (System.Console.WriteLine(System.Object), mdToken: 0000000006000082)
00007fff`04ff22d5 90              nop

C:\Users\ATField\Documents\Visual Studio 2017\Projects\TypeOfTest\TypeOfTest\Program.cs @ 26:
00007fff`04ff22d6 90              nop
00007fff`04ff22d7 488d65f0        lea     rsp,[rbp-10h]
00007fff`04ff22db 5e              pop     rsi
00007fff`04ff22dc 5f              pop     rdi
00007fff`04ff22dd 5d              pop     rbp
00007fff`04ff22de c3              ret


```
