
Recently I hear people talking about shared / collective code ownership a lot. In Martin Fowler's [excellent article](https://www.martinfowler.com/bliki/CodeOwnership.html) on code ownership, he defines 3 models:
1. Strong code ownership - every code module has an owner and only they can make the change.
2. Weak code ownership - every code module has an owner but you can make changes to other people's modules as long as you have their blessing. It's polite to talk to the owner first for substantial changes.
3. Collective/Shared code ownership - the code is collectively owned by the team and there is no distinct owner for module.

We can all agree strong code ownership is not great:
1. It often lead to significant delays when you want to make changes to modules other people own 
2. The owner become the bottleneck and has to make every single change himself. 
3. It can lead to a hard boundary mindset - any discussion of making the change yourself (assuming you are not the owner) can often lead to something more or less equivalent to "get off my lawn". 

Collective/Shared code ownership seems rather promising in first glance - the code is owned by everybody and you can make the change anywhere! However, in practice this can lead to several issues:
1. Without a clear owner in a module, it is often hard to find the correct people that has the necessary expertise to review your change. Imagine if you are making an change in garbage collector, you don't want to find a compiler front-end developer to review it for you. If you can find the right expert, how is that difference with the owner? In many cases people just stop bothering and just find your buddy and stamp the change, which is obviously bad.

2. Because there are no clear owners, code reviews can actually get delayed as there is no incentive for anyone to review 

3. There is no one thinking about the longer term vision/roadmap for the module and therefore it is the wild west. You can make whatever change as long as it is delivering some business value - but is it maintable long term? The code will keep growing organically and no one will be taking charge to fix it, until it got everyone's attention (which often can be quite expensive)

4. Without a clear owner, the knowledge of the module is spread across multiple people in the team and it often need multiple people having wokred in the component to put all pieces together in a big puzzle, which means solving issues in this module can become more expensive. It also diminishes the value of code review as the history of the module can often get lost.

Of course, it does have a few adantages:
1. Given that there is no owner, if the owner left other people can more likely to jump to help as there are better chance they have worked in the module before.
2. People are more motivated to work across modules / teams as there are less hard boundaries. 

At the end of the day, I strongly feel that having some form of ownership is a good thing - it clearly identifies the person in charge of the decision regarding the component and putting him in the position of thinking long term about the module, and establish point of contact and history. If we look at weak ownership, it is a reasonable compromise of both worlds - you have ownership, but people are still motivated to make changes to other people's module as long as they get their blessing. Of course, there are a broad spectrum of teams dynamics and projects, and there is no one size fit all solution. I suspect that for less complicated projects colletive code ownership can work really well, but as the code base gets larger and the technical issues get more challenging, having a weak ownership model can be really helpful to maintain the quality of the module. In some extremely technical case you might need strong ownership as maybe there are only a few person who deeply understand one particular module in your company (Anders Heilsberg's hand-written assembly Delphi compiler comes to mind), but you do want to keep that to a minimum as much as possible.


