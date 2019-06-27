


```
#include <iostream>

using namespace std;

void __attribute__ ((noinline)) my_copy(char *src, char *dst, int length) {
  for (int i = 0; i < length; ++i) {
    *dst++ = *src++;
  }
}

template<int length>
void __attribute__ ((noinline)) my_copy_fast(char *src, char *dst, int) {
  for (int i = 0; i < length; ++i) {
    *dst++ = *src++;
  }
}

typedef void (*copy_fn)(char *src, char *dst, int length);

int get_size() {
  return 5;
}

copy_fn get_fn(int size) {
  if (size == 5) {
    return my_copy_fast<5>;
  }
  return nullptr;
}

int main(void) {
  char src[5] = "ABCD";
  char dst[5];

  int size = get_size();
  copy_fn fn = get_fn(size);

  fn(src, dst, size);

  std::cout << dst << std::endl;

  return 0;
}
```


g++ -O -S test.cc

```
	.globl	__Z12my_copy_fastILi5EEvPcS0_i ## -- Begin function _Z12my_copy_fastILi5EEvPcS0_i
	.weak_definition	__Z12my_copy_fastILi5EEvPcS0_i
	.p2align	4, 0x90
__Z12my_copy_fastILi5EEvPcS0_i:         ## @_Z12my_copy_fastILi5EEvPcS0_i
	.cfi_startproc
## %bb.0:
	pushq	%rbp
	.cfi_def_cfa_offset 16
	.cfi_offset %rbp, -16
	movq	%rsp, %rbp
	.cfi_def_cfa_register %rbp
	movb	(%rdi), %al
	movb	%al, (%rsi)
	movb	1(%rdi), %al
	movb	%al, 1(%rsi)
	movb	2(%rdi), %al
	movb	%al, 2(%rsi)
	movb	3(%rdi), %al
	movb	%al, 3(%rsi)
	movb	4(%rdi), %al
	movb	%al, 4(%rsi)
	popq	%rbp
	retq
	.cfi_endproc
                                        ## -- End function
```

```
	leaq	-24(%rbp), %rdi
	leaq	-37(%rbp), %rbx
	movl	$5, %edx
	movq	%rbx, %rsi
	callq	__Z12my_copy_fastILi5EEvPcS0_i
```

