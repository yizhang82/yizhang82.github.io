---
layout: post
title:  "Fun C++ bug - transactional objects should have move semantics"
description: Objects with transactional semantics need move support
permalink: 
comments: true
excerpt_separator: <!--more-->
categories:
- C++
- design
---

OK. I must admit this probably isn't the best title out there.

Let's imagine I have an object that represents a file in a transaction. Recall that transaction needs to be all-or-nothing - if the transaction is complete the files can be kept around / moved to the final destination, otherwise they need to be deleted.

The more or less obvious idea that comes to mind is to represent this with a TxnFile class (TransactionalFile). This is the best part I love about C++, BTW - very clean scoped / destruction semantics. 

```c++
class TxnFile {
 public:
  TxnFile(const std::string &file)
    : m_file(file), m_committed(false) {
  }
  
  ~TxnFile() {
    if (!m_committed) {
      std::remove(file);
    }
  }

  const std::string &get_file() { return m_file; }

  void commit() {
    m_comitted = true;
  }
}

 private:
  std::string m_file;
  bool m_committed;
};

```

OK. So far so good. Let's actually implement that business logic:

```c++

std::vector<TxnFile> txn_files;

// Collect the files
for (auto &file : some_files) {
  txn_files.emplace_back(file);
}

// Do something with them. If exception is thrown we'll remove the files
for (auto txn_file : txn_files) {
  do_some_work(txn_file.get_file());  
} 

// If all is well, commit
for (auto txn_file : txn_files) {
  txn_file.commit();
}

```

Looks rather straight-forward, right? If you try this out yourself, you'll soon realize something is off - the files are being deleted for no reason at all!

The problem itself is obvious-ish: it really should've been a `auto &` as otherwise are constructing copies of TxnFile and upon destruction will remove the file!

```c++

// If all is well, commit
for (auto &txn_file : txn_files) {
  do_some_work(txn_file.get_file());
}

```

However, we are not done yet. The problem is still happening - and in some cases, the files are even removed before we actually do work! 

The problem, perhaps not that surprisingly, lies with the `std::vector` class. When expanding size of `std::vector`, STL will try to create a new block of memory, and copy/move the memory to it. If the class doesn't have a move constructor, it'll default to copy, and destroy the old one - which isn't unlike the `auto txn_file` problem we discussed earlier, though a bit more subtle to catch.

Let's try fixing it:

```c++
class TxnFile {
 public:
  TxnFile(const std::string &file)
    : m_file(file), m_committed(false) {
  }
  
  TxnFile(const TxnFile &&file) {
    m_file = std::move(file.m_file);
    m_committed = file.committed;
  }

  ~TxnFile() {
    if (!m_committed) {
      std::remove(file);
    }
  }

  const std::string &get_file() { return m_file; }

  void commit() {
    m_comitted = true;
  }
}

 private:
  std::string m_file;
  bool m_committed;
};

```

Looks reasonable, right? Actually the problem is still there! The problem is that you now have a const r-value reference `const TxnFile &&`. This means that even though you have a r-value reference, you can't change it at all - and what's the point of that if you want the move semantics? The right way is to use a regular r-value reference `TxnFile &&`. Keep in mind declaring move constructor disable the copy constructor so you shouldn't run into this problem again. But just for better clarifying the intention, it's a good practice to delete the copy constructor explicitly. 

```c++
class TxnFile {
 public:
  TxnFile(const std::string &file)
    : m_file(file), m_committed(false) {
  }
  
  TxnFile(const TxnFile &) = delete;
  TxnFile &operator =(const TxnFile &) = delete;

  TxnFile(TxnFile &&rhs)
    : m_file(std::move(rhs.m_file), m_committed(rhs.m_committed) {
  }

  TxnFile &operator = (TxnFile &&rhs) {
    reset();

    m_file = std::move(that.m_file);
    m_committed = that.m_committed;
  }

  ~TxnFile() {
    reset();
  }

  void reset() {
    if (!m_committed) {
      std::remove(file);
    }
  }

  const std::string &get_file() { return m_file; }

  void commit() {
    m_comitted = true;
  }
}

 private:
  std::string m_file;
  bool m_committed;
};

```

## A bit of rant

OK. We are finally done. Personally I think C++ has grown to the point that it is too complicated for most people and the interaction between different features can lead to really surprising behaviors. Even if you want to write a simple class there is already too much things to consider (copy/move semantics). And don't get me started on template meta programming. However, if you stick to a relatively sane subset of C++, maybe you'll be fine. Just maybe. I've been working in large C++ codebases profesionally for 14+ years and I still make stupid mistakes.

