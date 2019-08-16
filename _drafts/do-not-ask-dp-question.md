---
layout: post
title: "Don't ask DP questions in interview, ever" 
description: DP questions are the worst kind of question for interviews 
permalink: do-not-ask-dp-questions-in-interview 
comments: true
excerpt_separator: <!--more-->
categories:
- interview
- opinion 
---

I still remember my first interview in a certain big tech company. I prepared for the coding interview, and I got the job. Apparently they loved me, but one of the feedback is "this guy can't write performant code". Why? Because I got two Dynamic Programming questions and couldn't answer them. Yes, I got the job, but as a tester, not a dev, because this guy can't write performant code.

Apparently everyone writes performant DP code in their jobs?

Thank god, no. 

Unfortunately, I learned the lesson and spent quite a bit of time to learn DP, and got reasonably good at it. Because apparently there are still people out there asking such questions.

Yes, one of you can probably find a case that DP did help significantly, but in my last 15 years of professionallly writting code (and non-professionally for 8 years), I have never ever find the need to use dynamic programming, other than interview questions or a coding assignment. 

Some might argue: "OK, it may not be as used as widely, but it isn't necessarily a bad one, just like you probably won't write your binary tree". 

This has some truth in it, but I still believe DP is probably one of the worst possible coding question you can ask. 

My reason is simple: 

Dynamic Programming has a very specific pattern of solving the problem. Most (if not all) such problems are basically not solvable with reasonable time/space efficiency (other than brute force depth-first/breadth-first search), so if the candidate has never heard of DP, they will simply get stuck (just like I did back then). I doubt even Knuth could come up with DP from scratch on the spot. And if you have studied DP and solve it, that only means you understand the pattern and nothing more. It might as well be a math or a physics problem to see if you can apply patterns. 

Same applies to "tricky questions". Certain coding questions (like certain math/physics problems) requires you to look at the problem in a non-obvious way and without that "insight" it is mostly impossible to solve the problem. Most people would get stuck. Those lucky ones who come up with it will solve the problem rather quickly. But again, what do you know about them other than they got lucky this time? It's possible this guy is a genius and sees this immediately, but what can you say about the other people who are lucky or unlucky?

> Side note - I was really bad at solving physics problems at high school. Then I found out why. Many of the problems requires a certain trick (like "imagine this road has zero friction, etc") and with that you can translate the problem into a much simpler problem. Once you know the pattern of the problem, it's easy. So what I did is to find a book with all the physics questions and basically work through all these patterns. 

If you really like to ask these kind of questions, you might want to ask youselve why is that. You might be super happy that you have this super clever question and what to impress people. However, that's not why we have interviews. The real goal of a interview is to see how the candidates are going to perform on the job. You need to work with them, find out their strength, see if they can translate ideas to code, apply some pressure and see how they respond, etc. 

The best kind of question are:
1. Requires no specific knowledge/context (at least for general coding questions and/or general hiring). 

Of course, you gotta know your basic data structures. But no red-black tree, please. 

2. Most people can come up with something that you can work with - they won't just get stuck

My personal favorite are string questions - you gotta know your strings. People who can't code strings will never be a good dev.

3. Has multiple solutions - may be an obvious one that you can work with, and a non-obvious but more efficent solution that requires a bit of hint








