
There was one time I was debugging a perl script in our infra that collects some metrics and 

```
print "before";
my $some_data = `some_external_program`;
print $some_data;
# some other work
print "after";
$dbh = DBI->connect("<some_connection_string>", '', {RaiseError=>1});
# some work being done with the connection
```

What I'm seeing is that I can only see before, and $some_data, but not after. There are some work being done in between but nothing that could've resulted a hang. I attached GDB to the perl program and it is trying to do a connect and stuck waiting for response. That part is more or less expected because the server is saturated with connections as part of my experiment:

```
#0  0x00007f14ad1b5b2d in recv ()
#1  0x00007f14a5902c71 in recv (__flags=0, __n=16384, __buf=0xb68600, __fd=<optimized out>)
#3  vio_read (vio=0xb68410, buf=0xb68600 "", size=16384)
#4  0x00007f14a5902d12 in vio_read_buff (vio=0xb68410, buf=0xb6c610 "", size=4)
#5  0x00007f14a58e8087 in net_read_raw_loop (net=0xb65510, count=4)
#6  0x00007f14a58e830f in net_read_packet_header (net=0xb65510)
#7  net_read_packet (net=0xb65510, complen=0x7fff5f802070)
#8  0x00007f14a58e8be9 in my_net_read (net=0xb65510)
#9  0x00007f14a58df696 in cli_safe_read (mysql=0xb65510
#10 0x00007f14a58e3983 in mysql_real_connect (mysql=0xb65510, host=<optimized out>, user=<optimized out>, passwd=0x7f14a5968e3d "",
    db=<optimized out>, port=0, unix_socket=<optimized out>, client_flag=131074)
#11 0x00007f14a5e68b74 in mysql_dr_connect ()
#12 0x00007f14a5e6a0f4 in my_login ()
#13 0x00007f14a5e6a1f2 in mysql_db_login ()
#14 0x00007f14a5e7639b in XS_DBD__mysql__db__login ()
#15 0x00007f14ae1f240f in Perl_pp_entersub ()
#16 0x00007f14ae1eab86 in Perl_runops_standard ()
#17 0x00007f14ae181eaf in Perl_call_sv ()
#18 0x00007f14a64a21d9 in XS_DBI_dispatch ()
#19 0x00007f14ae1f240f in Perl_pp_entersub ()
#20 0x00007f14ae1eab86 in Perl_runops_standard ()
#21 0x00007f14ae187985 in perl_run ()
#22 0x0000000000400d99 in main ()
```

I've scratched my head for a good 15+ minutes at this until I finally realized what might be going on - Perl might be buffering the stdout so that what I'm seeing isn't exactly what's happening. It turns out that Perl would only flush stdout if you print out "\n"! So the fix is rather straightforward - just add the "\n" at end of each print and everything is as expected - I can see after being printed and it hangs.