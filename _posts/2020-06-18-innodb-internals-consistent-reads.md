---
layout: post
title:  "InnoDB Internals - consistent reads"
description: 
permalink: innodb-internals-consistent-reads
comments: true
excerpt_separator: <!--more-->
categories:
- database 
- innodb 
- mvcc
- undo
- mysql 
---

# InnoDB Internals - Consistent Reads

## Overview 

I've been doing some research in this area trying to understand how this works in databases (for my upcoming project), so I thought I'd share some of my learnings here.

InnoDB internally uses ReadView to establish snapshots for consistent reads - basically giving you the point-in-time view of the database at the time when the snapshot it is created. 

In InnoDB, all changes are immediately made on the latest version of Database regardless whether it has been committed or not, so if you don't have MVCC, everybody will see the latest version of rows and it'll be a disaster for consistency. Not to mention you'll need to be able to rollback the changes. In order to achieve this, InnoDB maintains a undo log to track a link list of changes made by other transactions, so reading in the past with a snapshot means going from the latest record in the BufferPool, and walk backwards to find the first visible change. Rollback is similar.

> This also means the undo log can't be purged if the snapshot is still active, and undo log will get longer and longer, which slows down the reads more and more. This is the infamous long running transaction issue.

The fundamental issue is that you need to be able to determine visibility of changes. This is done with two things:
1. InnoDB tracks the trx_id_t of each rows and in the undo log
2. InnoDB internally use a data structure called `ReadView` to determine if a transaction is visible in the snapshot.

So the algorithm becomes as simple as walking the list backwards and find the first visible record.

<!--more-->

For example - assuming current transaction is `6941`, and the latest record is made by transaction `6999`, and the undo log looks as follows:

```
6940 -> 6943 -> 6945 -> 6999
```

This link means the row has been modified by `6940`, `6944`, `6958`, `6999` in order.

In order to determine visibility, `ReadView` tracks a upper bound, lower bound and list of active transactions.

Assuming the system has the following transactions on-going with following trx_id_t: `(6943, 6945)`, and `trx_sys->max_trx_id=6959`: 

ReadView is going to establish the following view for snapshot:

| Lowest   | On-going | Future |
| -----  | -------- | ----- |
|  < 6943      | 6943, 6945 | >= 6959 (max_trx_id) 

This implies:
* Any transactions < `6943` are definitely visible, because they are not active when the snapshot is established, and they have already been committed.
* Any transactions >= `6959` (inclusive) are future changes that will not been seen by this snapshot.
* Any transactions falling within this range have two possibilities:
  * At the time the snapshot is created, the on-going transactions are `6943` and `6945`. These transactions are old transactions and any updates by them are not visible, since they haven't committed yet
  * Otherwise, they have already been committed and should be visible

BTW, in case if you are wondering: the reason `6959` is inclusive is because max_trx_id is reserved for the next transaction, just as the comment in InnoDB code suggests:

```c++
  volatile trx_id_t max_trx_id; /*!< The smallest number not yet
                                assigned as a transaction id or
                                transaction number. This is declared
                                volatile because it can be accessed
                                without holding any mutex during
                                AC-NL-RO view creation. */
```

So, looking back at the link list:

```
6940 -> 6943 -> 6945 -> 6999
```

We can determine:
* 6999 is invisible because it is >= 6959 so belongs to the future (either committed or not committed, doesn't matter)
* 6945 and 6943 are part of on-going transaction at time of snapshot, which means they are old transactions that are not yet committed at the time of snapshot creation (but they did commit later when we read now), so they are also invisible
* 6940 is visible because it is less than 6943, so it has already committed in the past and is by definition visible.

So we should return the record with trx_id_t = `6940`.

Let's look into this process with a bit more detail.

## Creating the ReadView

Whenever you try to read any row in InnoDB with consistent read (as opposed to locking reads, which is another topic that is worth discussing in another article), a ReadView is going to be assigned to the active transaction:

```c++
  } else if (prebuilt->select_lock_type == LOCK_NONE) {
    /* This is a consistent read */
    /* Assign a read view for the query */

    if (!srv_read_only_mode) {
      trx_assign_read_view(trx);
    }
```

The assignment is rather straight-forward - it it either opens a view from free list or use the existing view if there is one already:

```c++
/** Assigns a read view for a consistent read query. All the consistent reads
 within the same transaction will get the same read view, which is created
 when this function is first called for a new started transaction.
 @return consistent read view */
ReadView *trx_assign_read_view(trx_t *trx) /*!< in/out: active transaction */
{
  ut_ad(trx->state == TRX_STATE_ACTIVE);

  if (srv_read_only_mode) {
    ut_ad(trx->read_view == NULL);
    return (NULL);

  } else if (!MVCC::is_view_active(trx->read_view)) {
    trx_sys->mvcc->view_open(trx->read_view, trx);
  }

  return (trx->read_view);
}
```

Assuming first time within this transaction, within `mvcc::view_open`, it calls into `ReadView::prepare` to setup the boundaries as discussed earlier:

```c++
void ReadView::prepare(trx_id_t id) {
  ut_ad(mutex_own(&trx_sys->mutex));

  m_creator_trx_id = id;

  m_low_limit_no = m_low_limit_id = m_up_limit_id = trx_sys->max_trx_id;

  if (!trx_sys->rw_trx_ids.empty()) {
    copy_trx_ids(trx_sys->rw_trx_ids);
  } else {
    m_ids.clear();
  }
```

During `copy_trx_ids`, `m_up_limit_id` is assigned to the smallest: 

```c++
  m_up_limit_id = m_ids.front();
```
It is perhaps a bit counter-intuitive as they are sort of reversed:
* m_up_limit_id is the lower bound of visible trx_id_t (of transactions)
* m_low_limit_id is the upper bound (exclusive) of visible trx_id_t (of transactions)

And m_ids is the list of on-going trx_id_t (that are invisible).

With these knowledge, now we are ready to read the rows for real.

## Reading the rows

Assuming this transaction is trying to read some rows:

```sql
SELECT * from t1 where pk=6;
```

When reading rows, eventually we'll get here:

```c++
      if (srv_force_recovery < 5 &&
          !lock_clust_rec_cons_read_sees(rec, index, offsets,
                                         trx_get_read_view(trx))) {
        rec_t *old_vers;
        /* The following call returns 'offsets' associated with 'old_vers' */
        err = row_sel_build_prev_vers_for_mysql(
            trx->read_view, clust_index, prebuilt, rec, &offsets, &heap,
            &old_vers, need_vrow ? &vrow : NULL, &mtr,
            prebuilt->get_lob_undo());
```

`lock_clust_rec_cons_read_sees` is mostly just check if the record is visible:

```c++
  trx_id_t trx_id = row_get_rec_trx_id(rec, index, offsets);

  return (view->changes_visible(trx_id, index->table->name));
```

We check to see if the record in question can be observed by checking the trx_id_t field of the record and see if it is visible in the view.

As already discussed, `changes_visible` uses `(m_up_limit_id, m_low_limit_id)` as a fast path:
* If id < `m_up_limit_id`, it happens in the past and definitely visible
* If id >= `m_low_limit_id`, it happens in the future and definitely not visible

Then it does a binary search over list of transactions to see if it is in the list of active transactions at the time of the `ReadView` is established. If it is in the list, then it is definitely not visible.

```c++
  /** Check whether the changes by id are visible.
  @param[in]	id	transaction id to check against the view
  @param[in]	name	table name
  @return whether the view sees the modifications of id. */
  bool changes_visible(trx_id_t id, const table_name_t &name) const
      MY_ATTRIBUTE((warn_unused_result)) {
    ut_ad(id > 0);

    if (id < m_up_limit_id || id == m_creator_trx_id) {
      return (true);
    }

    check_trx_id_sanity(id, name);

    if (id >= m_low_limit_id) {
      return (false);

    } else if (m_ids.empty()) {
      return (true);
    }

    const ids_t::value_type *p = m_ids.data();

    return (!std::binary_search(p, p + m_ids.size(), id));
  }
```

Once we establish that the current record isn't visible to current `ReadView`, we'd go down the rabbit hole of checking the undo log:

```c++
      if (srv_force_recovery < 5 &&
          !lock_clust_rec_cons_read_sees(rec, index, offsets,
                                         trx_get_read_view(trx))) {
        rec_t *old_vers;
        /* The following call returns 'offsets' associated with 'old_vers' */
        err = row_sel_build_prev_vers_for_mysql(
            trx->read_view, clust_index, prebuilt, rec, &offsets, &heap,
            &old_vers, need_vrow ? &vrow : NULL, &mtr,
            prebuilt->get_lob_undo());
```

It simply calls to `row_vers_build_for_consistent_read` and it does a loop to scan the undo log backwards from the record:

```c++
dberr_t row_vers_build_for_consistent_read(
    const rec_t *rec, mtr_t *mtr, dict_index_t *index, ulint **offsets,
    ReadView *view, mem_heap_t **offset_heap, mem_heap_t *in_heap,
    rec_t **old_vers, const dtuple_t **vrow, lob::undo_vers_t *lob_undo) {
  trx_id = row_get_rec_trx_id(rec, index, *offsets);

  version = rec;

  for (;;) {
    /* If purge can't see the record then we can't rely on
    the UNDO log record. */

    trx_undo_prev_version_build(rec, mtr, version, index, *offsets, heap,
                                &prev_version, NULL, vrow, 0, lob_undo);

    if (prev_version == NULL) {
      /* It was a freshly inserted version */
      *old_vers = NULL;
      break;
    }

    *offsets = rec_get_offsets(prev_version, index, *offsets, ULINT_UNDEFINED,
                               offset_heap);

    trx_id = row_get_rec_trx_id(prev_version, index, *offsets);

    if (view->changes_visible(trx_id, index->table->name)) {
      /* The view already sees this version: we can copy
      it to in_heap and return */

      buf =
          static_cast<byte *>(mem_heap_alloc(in_heap, rec_offs_size(*offsets)));

      *old_vers = rec_copy(buf, prev_version, *offsets);
      break;
    }

    version = prev_version;
  }

  return err;
}
```

The code is simplified to make it more readable:
* `trx_undo_prev_version_build` reads the previous undo log record into prev_version
  * If it we reached the end, just exit the loop. By definition this would be a INSERTed row after this transaction, otherwise there would be at least one visible record in the undo log chain containing the original value.
* retrieve the trx_id of prev_version
* See if the trx_id is visible in the view
  * If yes, copy it and assign to `old_vers`
  * Otherwise keep looping

## What's next

I'm planning to write more about MySQL / RocksDB / MyRocks / InnoDB and have a bunch of notes taken in my backlog. I was thinking about making it into a series but I end up realizing I'll never have time to write a cohesive series about any of them given the scope of things. So I'll just write about whatever I'm researching and get it out, and forget about the whole series thing. Hopefully this way I'll actually get more done.
