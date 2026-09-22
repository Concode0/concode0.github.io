---
title: "Following Expert Cache Misses in ds4"
publishedAt: 2026-09-22
description: "Notes from tracing cache misses, router state, latent sketches, and I/O scheduling in DeepSeek V4.1 SSD streaming."
isPublish: false
isDraft: true
---

I started looking at ds4's expert cache because the miss count looked large enough to be interesting.

The setup was DeepSeek V4.1 Flash Q2 on my M5 Pro with 48 GB of unified memory. The model file itself was about 341 GiB, so SSD streaming was doing real work. For the run I used most often, the context started at 4096 tokens and I decoded another 256 tokens.

The dynamic expert cache held 1,889 routed experts, or about 17.5 GiB. Each routed expert was roughly 9.5 MiB.

Over those 256 decode tokens, there were 61,440 expert lookups:

```text
hits      51,227
misses    10,213
hit rate   83.38%
reloads     6,206
```

Those misses caused about 94.7 GiB of application-level expert reads.

That seemed large enough that cache policy was an obvious place to look.

## The oracle gap looked very large

The first thing I did was record the expert access sequence and replay it offline.

The current policy was already reasonably reproducible in the replay: 10,188 simulated misses versus 10,213 in the captured run. That was close enough to use the replay for comparisons.

Then I ran Belady's algorithm, which gets to cheat by knowing every future access.

The difference was large:

```text
captured current    10,213 misses
LFU                  9,580
Belady               5,481
```

So, in that finite trace, 4,732 misses were avoidable with perfect future knowledge. Almost half of the misses disappeared.

That number was tempting.

My first thought was that there might be a much better online cache policy hiding somewhere between the current heuristic and Belady. The router is structured, the model is autoregressive, and expert selection clearly has temporal locality. Maybe a small predictive model could recover a useful part of that gap.

Before trying anything complicated, I looked at what the oracle was actually saving.

## The cache already knew about the obvious locality

Expert routes were quite persistent.

On the Italian-text run, the same-layer route overlap between adjacent tokens was about 47.6%. Some experts were much more persistent than others. The first-ranked selected expert survived into the next token much more often than the sixth-ranked one, and long streaks were especially likely to continue.

At first that sounded like a very convenient prefetch signal.

The problem was that most of the easy predictions were already cache hits.

For example, simply using the previous token's same-layer route gave roughly 47.6% route recall. Once I filtered that prediction down to experts that were actually nonresident and therefore worth prefetching, it found only 129 next-token demand misses from 627 speculative requests.

The demand-miss recall was about 1.3%.

So route prediction looked much better than useful miss prediction.

That distinction ended up mattering throughout the investigation. A predictor can be quite good at saying which expert will appear next and still do almost nothing for the cache if those experts are already resident.

The reuse distances also changed how I thought about the Belady result.

Of the 6,206 reloads, the median time since the previous use was around 52 tokens. Only a small fraction came back immediately after eviction.

The interesting misses were often experts that had gone quiet for tens of tokens and then returned.

Belady can look at two old experts and know that one will return in 17 tokens while the other will never appear again in the rest of the trace. An online policy just sees two old experts.

That is a much harder problem than protecting the last route.

## Trying small predictive models

I tried a few increasingly structured versions of the same idea.

There were age-based hazards, per-layer and per-expert popularity, rank, streak length, recent frequency, EWMA-style scores, and semi-Markov-style reuse scores.

Some of those features predicted routes reasonably well. They just did not consistently produce better eviction decisions.

Plain LFU was annoyingly hard to beat.

Across the three traces I used later — Italian text, code, and a story/memory-style prompt — LFU recovered a modest but fairly stable part of the Belady gap. The more elaborate causal scores sometimes helped one workload and lost on another.

That was useful by itself. I had started from a fairly vague idea that "the router must contain enough structure to predict cache value." The first few experiments made that claim much narrower.

There was signal, but much of it described experts that the cache was already handling correctly.

## Cross-layer routes were more interesting

The next thing I tried was current-token information from earlier layers.

V4.1 has 40 routed MoE layers. Each layer has its own 384 experts and selects six of them. Expert ID 20 in layer 5 has no identity relationship with expert ID 20 in layer 6, but the route taken by layer \(L-1\) can still be statistically associated with the route later taken by layer \(L\).

This is also causally usable: after layer \(L-1\)'s selected IDs have been read back, there is still some execution time before layer \(L\) needs its experts.

A sparse adjacent-layer pair table was surprisingly decent when trained inside the same session.

For the nonresident top prediction per layer, precision on held-out portions was roughly:

```text
Italian     7.8%
Code       27.8%
Story      29.2%
```

That was much better than a simple popularity prior.

Then I trained the association on the Italian trace and applied it directly to the code and story traces.

Precision dropped to around one percent.

So whatever the table had learned, it behaved more like session state than a reusable architectural rule.

That still seemed potentially useful — online session learning is allowed — but it made the controller less attractive. The table was already growing into tens of thousands of sparse pair entries, and the real CPU cost in the decode path had not even been measured yet.

I kept going mostly because I wanted to know how much information was actually available.

## Looking directly at router state

The selected expert IDs are a fairly lossy view of the router.

I added another diagnostic trace that captured more of the current router state: top candidates, transformed probabilities, biased scores, entropy-like statistics, rank margins, and the selected weights.

I also wanted a cheap test of whether the hidden state itself contained useful cache information that route history was throwing away.

The router input at that point is a 5,120-dimensional normalized hidden vector. I did not want to train an encoder just to answer that question, so I projected it into 8 and 16 dimensions with a fixed random projection and stored those sketches with the router trace.

This was intentionally crude.

If even a tiny sketch consistently improved future-reuse prediction, then it would at least tell me that current latent state carried something interesting beyond route history. If it did nothing, building a larger learned representation would be harder to justify.

I trained simple causal reuse models over several horizons and compared:

```text
history only
history + router state
history + router state + 8D latent sketch
history + router state + 16D latent sketch
```

Router state added a little on some workloads.

The incremental gain beyond history was small: a few percentage points of the current-to-Belady gap on Italian and code, and slightly negative on the story trace.

The latent sketches were even less convincing.

Eight or sixteen dimensions did not produce a reproducible cache improvement. Shuffling or shifting the latent sketches barely changed the result, and sometimes the control did better. Training on one workload and transferring to another also degraded badly.

I stopped there.

It is possible that a better representation could extract something from the full hidden state. I did not try to prove otherwise. The small-sketch experiment was enough for the question I had at the time: there was no obvious low-dimensional cache signal waiting to be picked up.

I also checked whether better prediction could let me shrink the explicit cache. Going from 1,889 slots to 1,417 or 945 made misses noticeably worse even with the better causal policies. So there was no easy "use a smarter controller and give the memory back" result either.

## Then the I/O numbers started looking strange

While doing all of this, one measurement kept bothering me.

The baseline had issued 94.67 GiB of expert `pread` traffic during decode.

The measured parallel expert-read wall was about 4.97 seconds.

That works out to roughly 19 GiB/s of application-level read throughput.

That is not a believable physical NAND rate for this machine.

The reads were real from ds4's point of view: the explicit expert cache had missed, `pread` had been called, and the expert data had been copied into the Metal cache buffers.

But those bytes did not all have to come from the SSD.

There was another cache underneath the cache I had been studying.

macOS had its own file-backed pages.

So the effective path during a warm run looked more like:

```text
model file
    ↓
macOS file/page cache
    ↓
pread()
    ↓
ds4 expert cache
    ↓
Metal
```

A miss in ds4's explicit expert cache could still be a warm read from memory at the OS level.

That made the original miss count less directly connected to physical SSD cost than I had been assuming.

I later ran `iostat` next to a short benchmark. During prefill, disk throughput went up to several GB/s, which was consistent with the model actually being streamed from storage.

Late in decode, disk activity dropped sharply. The final one-second samples were down in the tens of MB/s and eventually almost zero, while ds4 still reported tens of GiB of application-level expert reads over the whole decode.

I did not do a controlled cold-cache run, so I cannot turn that into a precise physical-byte accounting. A reboot or explicit cache purge would be needed for that. For the warm runs I actually cared about, though, the distinction was already enough to change what I wanted to optimize.

## Scheduling the misses I already knew about

At that point prediction was starting to look like a fairly expensive way to chase a small amount of wall time.

There was a simpler scheduling detail in the existing code.

After routing, ds4 knows exactly which six experts are needed. If some are resident and some are missing, it has a split path that can start the missing reads and do resident expert work while those reads are in flight.

The default path only used that split when at least three experts were missing.

One- and two-miss layers were common, so they often waited for demand reads synchronously.

I changed the diagnostic threshold from three misses to one.

No prediction.

No new cache policy.

No extra cache capacity.

I ran two paired 64-token comparisons, reversing the run order for the second pair.

Steady decode changed from:

```text
9.57 -> 10.07 tok/s
9.33 -> 10.01 tok/s
```

Overall throughput changed from:

```text
8.85 -> 9.30 tok/s
8.75 -> 9.33 tok/s
```

The interesting part was that the cache statistics were exactly the same.

Both sides had the same hits, the same 4,488 misses, the same reload count, and the same 24.18 GiB of application reads.

The explicit `pread` wall was even slightly higher in the early-read runs.

The speedup came from where the wait happened, not from making the reads disappear.

That was probably the most useful result of the whole investigation.

## Where I ended up

I started with a large Belady gap and expected the interesting problem to be cache replacement.

There is still real replacement headroom. The oracle result is too large to ignore, and a longer-running online controller might eventually learn something useful about session-local expert lifetimes.

But following that idea through several levels — route history, reuse models, cross-layer associations, router statistics, and compressed latent state — kept reducing how much of the gap looked cheaply predictable.

At the same time, tracing the actual I/O made the meaning of a cache miss less simple than I had first assumed.

The explicit cache was only one layer of caching. Warm macOS file pages could make a reload much cheaper than the word "SSD streaming" suggested.

And once that was visible, a small scheduling change that left the miss count completely untouched produced a larger measured effect than the predictive cache experiments had managed to justify.

I still want to try a proper cold-vs-warm comparison at some point. I also want longer traces before completely giving up on session-adaptive prediction.

For now, the useful thing I got out of this was mostly a better map of the problem.

The miss counter was where I started.

It was not where the time was easiest to recover.
