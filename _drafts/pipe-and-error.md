# A curious case of shell pipes and Python

Occasionally I need to write some python code for scripting some stuff, and I ran into a interesting issue that worth bringing up.

Let's take a look at this code:

```py
#!/usr/bin/python3
import os
from subprocess import Popen,PIPE
from random import choice
import sys

def run_cmd(cmd):
    with open(os.devnull, "rb") as stdin:
        p = Popen(
        ' '.join(cmd),
        shell=True,
        stdin=stdin,
        stdout=PIPE,
        stderr=PIPE,
        close_fds=True,
        )
        p.wait()
        if p.returncode != 0:
            stdout = p.communicate()[0]
            raise RuntimeError(f"error: {stdout}")

cmd =[ 'some_utility', '|', 'tee', 'error.log' ]
run_cmd(cmd)
```

Code is straight-forward - call `some_utility` and dump the logs into error.log and into screen as well. However, the problem is, if `some_utility` fails, `pipe.returncode` would still be zero!

After scratching my head for a while, I saw that `shell=True` and I decided to try this in shell:

```
[01/30, 18:35:46][~/local, PID:2375874, SUDO]: abc | tee
zsh: command not found: abc
[01/30, 18:35:56][~/local, PID:2375874, SUDO]: echo $?
0
```

```
[01/30, 18:35:58][~/local, PID:2375874, SUDO]: abc | abc
zsh: command not found: abc
zsh: command not found: abc
[01/30, 18:37:07][~/local, 127, PID:2375874, SUDO]: echo $?
127
```
So, it looks like under shell `A | B` would only fail if `B` fails. This is not a great behavior, but if you think about it it kinda makes sense - the shell needs to launch A and B and start piping A's output to B's input, and whether A eventually fails B is still running, and one could argue that it is the responsibility of B to handle A's input failure if needed, and most of cases it doesn't matter (such as for utilities such as tee), except for more integrated scenarios.

To address this issue you have a few alternatives:
* Change the approach and don't use pipes - just redirect output to a file and be done with it
* Launch `tee` as a separate process and chain the pipe
* Instead of using `tee`, capture the output from python code and write that into a log file. We are using Python, after all 
* Use `set -o pipefail` to make pipe failure "failfast". This works in most shells (bash/sh/zsh). Arguably this should be the default, following the principle of least surprises. 
* Use `${PIPESTATUS[@]}` in bash/sh. This returns all the status of pipe commands and you can also specify which one, such as `${PIPESTATUS[0]}`. Unfortunately this doesn't seem to work in zsh for whatever reason.

There are also some brilliant solutions as suggested in [stack overflow post](https://stackoverflow.com/questions/1221833/pipe-output-and-capture-exit-status-in-bash/19804002), such as this one:

```
exec 4>&1
exitstatus=`{ { command1; printf $? 1>&3; } | command2 1>&4; } 3>&1`
```

Just like template meta-programming I'd avoid this in production code.
