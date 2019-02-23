---
layout: post
title: Why I love writing design docs and you should too  
description: 
permalink: write-your-design-docs
comments: true
excerpt_separator: <!--more-->
categories:
- projects
- career
---

## Why I love writing design documents

1. It is a excellent way to structure your thoughts

2. It is a one true place to track your design points

3. It documents your major design decision

4. It captures the discussion

5. It provides invaluable context / background

6. 

8. It is a starting point for discussion / review

9. It is a great resource to get new people up to speed

## How to write good design docs

1. Focus on the why, and less on the what/how

This is perhaps the most important point that I'm trying to make. It is easy to document all the nitty-gritty details about how things are done in a certain way, and how it is implemented. However, there is one thing better that documenting the implementation - that is the implementation itself! And it never gets out-of-date, as a bonus.

On the other hand, it is often much harder to understand *why* things are done in certain way from the code, which may include:

  * Options already explored that didn't work due to whatever reason

  * Assumptions being made back then which may or may not be true today

  * Using X integrates better with existing systems at that point

  * There was a big push for Y initiative across the company

2. Provide context/background/history

This is somewhat related to "Why" but is important enough that deserves its own section. Often times, when a feature is being developed, a project getting started, it is not being done in a vaccum. Maybe it is part of a company/org wide initiative, maybe it is part of project A, maybe it aligns better with feature Y which is being worked on, or Z team needs this feature for whatever business reason. These provides valuable insight on why the feature is done a certain way, and invaluable for future fixes/involving/changes. 

3. Evaluate your options

If there is only one obvious way to go about implementing a feature, it probably doesn't need a design doc anyway. It is obvious that you can figure out the implementation choice from the doc, but the road not taken can be even more important. Computer engineering / design is about trade-offs and there is no perfect solution - only the best for the job at hand. The best design docs carefully lays out the options and describe the trade-offs / pros and cons in each design, and find the best one that has the right trade-off for the current project.

4. Capture the data and back it up

