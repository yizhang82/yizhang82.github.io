---
layout: post
title:  "Wrapping async sqlite operation as promise"
date:   2017-10-24
categories:
- javascript
- promise
- await
permalink: async-sqlite-as-promise
comments: true
description: How to wrap async API as javascript promise
---  

I was experimenting with [sqlite package](https://github.com/mapbox/node-sqlite3) with node.js the other day and let's just say the async programming style is rather painful.

Let's say I'm working with a database with a `Voters` table that has two fields - Name and Count. 

```js
var sqlite = require('sqlite3').verbose();
var db = new sqlite.Database('test_db');

console.log('sqlite3...');
var stmt = "CREATE TABLE IF NOT EXISTS Voters (Name TEXT, Count int)";
console.log(stmt);
db.run(stmt, function (err) {
    if (err) {
        console.log(JSON.stringify(err));                        
        return;
    }

    vote("john doe", function (err, val) {
        if (err) {
            console.log(JSON.stringify(err));
            return;
        }

        console.log(`New vote for John Doe is ${val}`);
    });
});
```
And I need to write a function that increase the vote count by 1 or add a new voter entry for a specific voter:

```js
function vote(voter, callback) {
    var val;
    var getStmt = `SELECT Name, Count FROM Voters WHERE Name="${voter}"`;
    db.get(getStmt, function(err, row) {
        if (!row) {
            var insertSql = `INSERT INTO Voters (Name, Count) VALUES ("${voter}", 1)`;
            db.run(insertSql, function (err) {
                val = 1;
                callback(err, val);    
            });
        }
        else {
            val = row["Count"];
            val += 1;
            var updateSql = `UPDATE Voters SET Count = ${val} WHERE Name = "${voter}"`;
            db.run(updateSql, function (err) {
                callback(err, val);
            });
        }
    });
}
``` 

As you can see, the async callback style gets pretty painful here. You need to pass a callback to every function that returns an error or result, and within that callback you need to nest your remaining logic, and on and on. Writing a custom function `vote` also need to pass a callback and call when the final callback is done. The code is difficult to read and maintain.

## The promise land

In ES6, you can wrap callback based functions with Promise, which are essentially a return value with state (pending, resolved, rejected). If a function returns a Promise, it's the function's job to either resolve or reject it eventually, so that the caller knows when it's done - either successfully or unsuccessfully. 

It's best to demonstrate this with an example:

```js
db.getAsync = function (sql) {
    var that = this;
    return new Promise(function (resolve, reject) {
        that.get(sql, function (err, row) {
            if (err)
                reject(err);
            else
                resolve(row);
        });
    });
};
```

In this function, we are wrapping sqlite `get` method and make it returns a promise. When do we know the promise is going to be fullfilled? When the callback arrives. If it fails, call reject and pass the error. If it succeeded, pass the result. 

Once you have getAsync, you can now call the function like this:

```js
db.getAsync(stmt).then((row) => {
    // print row
}).catch((err) => {
    // handle error
});    
```

With the returned promise, you need to chain the promise with the next work using `then`, and handle the unhandled error with `catch`. The way to think about the `then` function is to treat them as a list of work - the next work inside the `then` callback will only get executed when the previous promise gets fullfilled. If it succeeded, then will get called next, otherwise `catch` is called with the error. If your `then` callback wants to do more work, it needs to return another promise that you can chain further using then.

With this, our vote code would look like this:

```js
function voteAsync(voter) {
    var val;
    var getStmt = `SELECT Name, Count FROM Voters WHERE Name="${voter}"`;
    return db.getAsync(getStmt).then((row) => {
        if (!row) {
            var insertSql = `INSERT INTO Voters (Name, Count) VALUES ("${voter}", 1)`;
            val = 1;
            return db.runAsync(insertSql);  // more work to do
        }
        else {
            val = row["Count"];
            val += 1;
            var updateSql = `UPDATE Voters SET Count = ${val} WHERE Name = "${voter}"`;
            return db.runAsync(updateSql);  // more work to do
        }
    }).then(() => {
        return val;     // when runAsync is done
    });
}
```

Note how voteAsync chains multiple promise together by returning another promise (from `runAsync`) and then applying `then` on top of that promise. 

To call the code, it looks like this:

```js
var stmt = "CREATE TABLE IF NOT EXISTS Voters (Name TEXT, Count int)";
db.runAsync(stmt).then(() => {
    return voteAsync("john doe");
}).then((val) => {
    console.log(`New vote for John Doe is ${val}`);
}).catch((err) => {
    console.log(JSON.stringify(err));
});    
```

This is an improvement, but still not quite as natural as you need to explicitly chain then using promise functions and follow those pattern.

## Async/Aawait

Fortunately, there are better ways to do this. With async/await support in node.js, you can write these async code just like how you would write regular synchronous code. That is, all javascript statements are *serialized*. The async/await infrastructure makes sure your code is split into multiple "phases" just like how you would write it in an promise `then` pattern, except that compiler does all the job for you. And all you need to do is to write this:

```js
async function voteAsync(voter) {
    var val;
    var getStmt = `SELECT Name, Count FROM Voters WHERE Name="${voter}"`;
    var row = await db.getAsync(getStmt);
    if (!row) {
        var insertSql = `INSERT INTO Voters (Name, Count) VALUES ("${voter}", 1)`;
        await db.runAsync(insertSql);
        val = 1;
        return;
    }
    else {
        val = row["Count"];
        val += 1;
        var updateSql = `UPDATE Voters SET Count = ${val} WHERE Name = "${voter}"`;
        await db.runAsync(updateSql);
    }
    return val;
}
```

The code isn't significantly smaller, but the logic is much simplified. You don't need to think in terms of promise chaining - you just write the code without worrying about the underlying "async-ness" of those calls. You do need to call `await` operator on functions that returns promise, and the compiler automatically 
* suspends the execution when the promise is in-progress but not done. This is very important as you don't want to block node.js main event loop. 
* resumes execution when the promise resolves
* throw exception when promise rejects. 

The function also needs to have `async` keyword to indicate it is a async function. Without it compiler will refuse to understand await keyword.

To call the async version, just call the function like a normal person (with await, of course):

```js
async function main() {
    try {
        var stmt = "CREATE TABLE IF NOT EXISTS Voters (Name TEXT, Count int)";
        await db.runAsync(stmt);
        var val = await voteAsync("john doe");
        console.log(`New vote for John Doe is ${val}`);
    } 
    catch (e) {
        console.log(JSON.stringify(ex));
    }
}
```

Again, this is slightly more code due to the try/catch and function goo (javascript doesn't let you call await without an async function), but the concepts are significantly simpler to understand and code much easier to write.

## Conclusion

Javascript promise and async/await is reasonably straight-forward abstraction for async programming once you get used to the model. Wrapping an "classic" callback model API with promise then calling it with async/await greatly simplifies your client code. 

BTW, in the upcoming C++ coroutine series, I'll be talking about how to wrap C async API with C++ coroutines, which are much more involved but would greatly help understand async/await model in a much deeper level. 

Hope this helps. 

