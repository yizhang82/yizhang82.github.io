'use strict'

var sqlite = require('sqlite3').verbose();
var db = new sqlite.Database('test_db');

function vote(voter, callback) {
    var val;
    var getStmt = `SELECT Name, Count FROM Voters WHERE Name="${voter}"`;
    console.log(getStmt);
    db.get(getStmt, function(err, row) {
        if (!row) {
            console.log("VOTER NOT FOUND");
            var insertSql = `INSERT INTO Voters (Name, Count) VALUES ("${voter}", 1)`;
            console.log(insertSql);
            db.run(insertSql, function (err) {
                val = 1;
                callback(err, val);    
            });
        }
        else {
            val = row["Count"];
            console.log(`COUNT = ${val}`);
            val += 1;

            // update
            var updateSql = `UPDATE Voters SET Count = ${val} WHERE Name = "${voter}"`;
            console.log(updateSql);
            db.run(updateSql, function (err) {
                callback(err, val);
            });
        }
    });
}

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


