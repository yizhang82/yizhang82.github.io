# Writing your own NES emulator - emulation strategy

# Emulation Strategy

## Hardware simulation

In theory, one can build a simulator that exactly replicates the hardware behavior on transistor level. For example, [visual6502.org](http://visual6502.org/) has [javascript based simulation](https://github.com/trebonian/visual6502) that simulates 6502 CPU in this manner. One can imagine once you have the entire hardware mapped out to transistors as a table, the entire simulation can be completely table driven. However, it is probably not too hard to imagine such approach might not have desirable performance. And writing such code and debugging such tables is going to be extremely hard. Just imagine - you are no longer debugging code, but actually debugging your table to find the 'missing/incorrect wire', making this impractical for most emulation authors, other than the electronic hacker/software engineer wizard. Such people are rare these days (I'm certainly not one of them).

## Software simulation

Not surprisingly, this approach replicates hardware behavior that is observable to software, and doesn't care what the hardware does. Of course, it still need to replicate hardware behavior accurate enough, in order to run as many programs as possible.

The trickiest part is *timing*. 

### Timing is everything

Hardware are naturally parallelized - CPU, APU, PPU, etc all of them runs in parallel and communicate to each other in real time. They run at their own pace. If such pacing are not emulated, programs might not work correctly, when they expect certain order of events when running in real hardware. 

You might think those programmers back in the days are code wizards that are doing these things to simply show off their programming chops. But this is not the case.

Today's well-behaved program usually doesn't take dependency on such timing on hardware - there are well established programming conventions such as callbacks (I'll call you if I need data), buffers (here are the data, go render/play it until I say otherwise), etc. There are enough processor speed and RAM to make that happen.

However, in the NES days, programmers only have so much time to update their screen each frame, and they have to carefully count their instructions to fit in, and in cases where they accidentally run more than needed, frames can be skipped causing slowdowns. And they also try to fully utilize (in other words, one might say abuse) limited processing power to do interesting effects, such as changing scrolling parameters mid-frame so that status bar doesn't move, etc. All these require timing to be accurate enough for those programs to function. Of course, there are straight-forward games that doesn't depend on timing that much. 

## Emulation Implementation Approaches

In terms of implementation, there are a few approaches as far as I can tell. Not all of them are good approaches - I'm simply listing them for thoughts experiment:
 
### Using dedicated cores for each hardware component running in parallel

As discussed before, imagine if you have dedicated cores for each component and they can be guaranteed to be run in parallel. In theory this can achieve fairly accurate timing. 

Do keep in mind that code running on each core doesn't run exactly at the correct hardware speed - they need to be synchronized to an internal clock cycle. This pretty much means that they need to synchronize *every* cycle. In practice this can be implemented as a common counter shared by all cores and checking counter every step of the way - and keep spinning if the counter isn't what is expected. 
 
However, in practice this is rarely done because not every one has enough cores to dedicate to run your best NEs emulator ever. You need at least 3 cores (CPU, PPU, APU). This means user would have at least 4 cores. And for every subcomponent (for example, PPU also have its own subchannels that runs their own pace), you also might need additional cores (or take a hybrid approach - see below).

 
### Running all components in one thread, one cycle at a time

In theory this would work out pretty great. But in practice this means each component needs to be able to execute in cycle granaruity. For PPU/APU this is less challenging because they tend to do one single job and managing states of that isn't too bad. For CPU instructions it is more involved, as instructions take multiple cycles, depending on many different factors. You need to be able to "suspend" mid-instruction, and "resume" running the instruction. This usually means maintain each instruction itself as an table of steps, and maintaining which instruction you are in and which step it is, as if the entire CPU is a finite state machine. For example, ADC instruction (add with carry) with absolute address (16-bit address) is on a high-level consists of a few steps:
    * fetch opcode (ADC), PC++
    * fetch low-byte (for 16-bit addr), PC++
    * fetch high-byte (for 16-bit addr), PC++
    * read from address, PC++

Interestingly, having state machines that allow suspension/resume isn't new. Many languages/compilers are adding support for async/await pattern which solves this exact problem - await become suspension points that program can suspend and then resume when the pending operation is complete. The compiler is repsonsible for generating the state machine. Imagine if the async/await infra is augmented to understand clock cycles, and it'll suspend if the desired cycles are already met ()

### Run CPU one instruction at a time, other components catch up

This one is a bit more straight-forward, until it breaks. You execute one instruction at a time, advance the internal CPU clock cycle, and ask all the other components to catch up until that cycle is complete. This is obviously less accurate, but is usually good enough, until you run into cases where certain components needs to observe state mid-instruction. This can be mitigated by logging the state changes (but don't apply them yet), and compare the state access with the log to determine whether the state change should be visible up to what point. And apply them when all components are done. This is somewhat similar to a transactional processing system where all changes are logged and applied at the end of transaction (one CPU instruction) - except that the changes are not strictly isolated (in other words, observable by other components running "in parallel").

## Challenges

* Understanding hardware behavior
* Timing and cycles
* Quirks/bugs

