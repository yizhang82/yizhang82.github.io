SQL variable should be transactional / atomic.

One potential way to address is to 1) take a lock in check and 2) reset the lock in a new reset function

