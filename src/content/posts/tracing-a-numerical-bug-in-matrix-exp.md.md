---
title: "Tracing a Numerical Bug in torch.linalg.matrix_exp"
publishedAt: 2026-09-22
description: "How a float32 accuracy issue in Clifra led to a coefficient bug in PyTorch's matrix exponential implementation."
isPublish: True
---

This started with a failing Hypothesis test.

I was working on Clifra's execution path at the time, so my first assumption was fairly ordinary: I had probably broken something.

The failure came from an accuracy check around the `versor_matrix` action. It was not a dramatic failure, and initially there was no reason to suspect
anything outside Clifra.

The size of the error was also awkwardly plausible. It was large enough to fail the accuracy check, but still small enough that, for float32 numerical
code involving matrix exponentials and several transformations, I could imagine it being an approximation error, an overly strict tolerance, or
something accumulating inside Clifra. It did not look like an obviously broken implementation.

I had also been changing execution-related code at the time. Clifra has several paths that eventually involve exponentials: there is bivector
exponential logic itself, but matrix exponentials also appear as part of geometric actions. So going back through my own code seemed like the obvious
place to start.

There was one complication, though. The test was using Hypothesis.

Once Hypothesis finds an interesting or failing example, it can keep that example around and try it again in later runs. So the fact that the same failure kept appearing did not necessarily mean that my most recent change had introduced it. It could just as well have been an old edge case that had finally been exposed.

That possibility turned out to matter.

## Starting from Clifra

I first treated it as a Clifra bug.

The action path involved layouts, coefficient transformations, exponentials, and a few different execution routes. Since I was already changing some of that machinery, I ended up going further back than I initially expected and checking earlier implementation decisions as well.

But after a while, one part of the story stopped making sense.

Why would a layout change numerical precision in this particular way?

Clifra had useful controls for comparison. For low-dimensional cases, I could compare the affected path against independent Taylor implementations and closed-form constructions. Those did not show the same behavior.

More importantly, the failure was strangely conditional.

The error changed with:

- batch shape,
- dtype,
- whether I was looking at the forward or backward pass,
- and, most suspiciously, the norm of the matrix.

That last one was what made me stop blaming Clifra.

A layout or coefficient-storage bug can certainly corrupt a result. But a bug that suddenly appears only inside particular matrix-norm intervals looks much more like an algorithm selecting different numerical approximations depending on the input.

At that point I started wondering whether the problem was lower down.

## Is it actually PyTorch?

The suspicious operation was `torch.linalg.matrix_exp`.

I asked an AI coding agent to inspect the relevant source paths and history while I started reading the paper referenced by PyTorch's implementation. This was useful mostly as parallel investigation: the source tree is large, and I wanted a map of the execution path while I checked the mathematics myself.

The implementation is based on the optimized Taylor polynomial construction described by Bader, Blanes, and Casas in *Computing the Matrix Exponential with an Optimized Taylor Polynomial Approximation*.

The interesting function was `compute_T8`, PyTorch's degree-8 approximation.

Its coefficients looked like this:

```cpp
constexpr scalar_t sqrt_177 = 0.1330413469565007072504e+2;
constexpr scalar_t x3 = 2. / 3.;

...

constexpr scalar_t x7 =
    (89. - sqrt_177) / (5040. * x3);
````

But the corresponding construction in the paper required \(x_3^2\) in that denominator.

In other words, this:

```cpp
constexpr scalar_t x7 =
    (89. - sqrt_177) / (5040. * x3);
```

should have been:

```cpp
constexpr scalar_t x7 =
    (89. - sqrt_177) / (5040. * x3 * x3);
```

The actual difference was just one factor.

The next question was whether it actually explained everything I had been seeing.

## Checking the polynomial

I did not want to rely only on visually comparing a line of C++ with a line from a paper.

The T8 construction can be expanded symbolically. If its coefficients are correct, the resulting polynomial should match the exponential Taylor series through degree eight.

With the corrected \(x_7\), it does.

With the PyTorch coefficient at the time, it does not.

The first mismatch appears at the \(A^5\) term. In fact, despite being a degree-8 polynomial, the faulty construction is only fourth-order accurate near zero. Its \(A^8\) coefficient is \(1/60480\), rather than the required \(1/40320 = 1/8!\).

So this was not just a tiny rounding difference caused by evaluating the same approximation differently. The polynomial itself was wrong.

At this point the strange norm-dependent behavior also started to make sense.

## Why batching changed the answer

The most confusing symptom had been this: duplicating the same matrix into a batch could make the error almost disappear.

That sounds wrong. Batching an input should not magically improve the accuracy of its matrix exponential.

And it does not.

It changes the execution path.

For singleton inputs, PyTorch chooses between several approximation degrees according to the matrix 1-norm: T1, T2, T4, T8, T12, and eventually T18.

For a flattened batch size greater than one, however, the implementation takes the highest-degree T18 scaling-and-squaring path instead.

So these two inputs can contain exactly the same matrix:

```python
A.shape == (2, 2)
```

and

```python
A.repeat(2, 1, 1).shape == (2, 2, 2)
```

while exercising different numerical algorithms internally.

The singleton could hit the faulty T8 implementation. The duplicated batch avoided it.

That was the explanation.

For float32, T8 was selected for singleton matrices whose 1-norm fell roughly between `0.051` and `0.580`. For float64, the corresponding interval was much smaller, roughly `0.00034` to `0.0499`.

This also explained another confusing observation: testing the same angle in float64 could appear perfectly fine. It was not because float64 was immune to the bug. The different thresholds simply caused that input to select another approximation.

## A small reproducer

Once the problem had been reduced to `matrix_exp`, the reproducer became much simpler than the code that originally exposed it.

I used the two-dimensional rotation generator

$$
A =
\begin{bmatrix}
0 & -\theta \\
\theta & 0
\end{bmatrix}.
$$

Its matrix exponential is known exactly:

$$
\exp(A) =
\begin{bmatrix}
\cos\theta & -\sin\theta \\
\sin\theta & \cos\theta
\end{bmatrix}.
$$

That makes it a convenient regression case: there is no need to compare PyTorch against another numerical matrix exponential implementation.

With `float32` and θ = 0.5, the singleton path produced a maximum absolute error of about:

```text
2.49e-5
```

Once I had the closed-form rotation as a reference, this was clearly not just noise from the surrounding Clifra computation.

Duplicating the exact same matrix into a batch of two reduced that to about:

```text
1.07e-7
```

Evaluating the corrected T8 polynomial gave an error of about:

```text
4.78e-8
```

The same pattern could be reproduced on CPU and, with the stable PyTorch version I tested, on MPS.

For float64, choosing \(\theta = 0.04\) put the singleton into its own T8 interval. The native singleton error was about `8.33e-11`, while the duplicated batch was already around machine precision.

So the batch behavior, dtype behavior, and norm dependence were all consequences of the same dispatch structure.

## The backward pass was weird too

There was still another symptom from the original investigation: backward could fail, but not always when forward failed.

This also looked less mysterious after reading PyTorch's autograd implementation.

The reverse-mode derivative of the matrix exponential is computed using another matrix exponential, this time on a block matrix containing the original input and the incoming cotangent.

Conceptually, it contains a matrix of the form

$$
M =
\begin{bmatrix}
A^H & G \\
0 & A^H
\end{bmatrix},
$$

where \(G\) is the cotangent.

That block matrix goes through `matrix_exp` again.

So backward can hit the same faulty T8 approximation.

But the norm of the block matrix is not necessarily the norm of the original forward input. Changing the cotangent can move it into or out of the T8 interval.

That means an inaccurate forward pass can coexist with an accurate backward pass, and vice versa. The two failures have the same root cause, but they do not necessarily select the same polynomial degree.

For a simple choice \(G = sI\), the expected VJP is available in closed form because \(I\) commutes with \(A^H\). With `float32`, \(\theta=0.5\), and \(s=0.01\), the native VJP error was about `2.47e-6`. After correcting the T8 coefficient, the same diagnostic dropped below `1e-9`.

That finally accounted for the intermittent-looking backward failures as well.

## Why had the existing tests not caught it?

PyTorch already had matrix exponential tests, including analytic comparisons and Taylor comparisons.

The problem was not a complete absence of coverage.

The relevant existing tests used tolerances such as `1e-3` and `1e-2`. The error I was seeing in the float32 example was around `2.5e-5`, comfortably below those thresholds.

That also matched my initial reaction to the failure: the error was real, but it sat in an uncomfortable range where it was easy to dismiss as ordinary numerical tolerance until the case was reduced more carefully.

There was also batch coverage, but random matrices did not guarantee a singleton input whose norm specifically selected T8.

So the bug could sit in a fairly narrow numerical path for a long time while still satisfying the broader accuracy tests.

For the regression test, I therefore used deterministic rotation matrices whose exact exponential is known, and deliberately selected angles that exercise the faulty T8 region. I also included singleton and batched forms and checked both forward and backward behavior.

## Sending it upstream

PyTorch's contribution process prefers an issue first for this sort of change, so I opened issue [#196592](https://github.com/pytorch/pytorch/issues/196592) with the reproducer, the source-level diagnosis, the derivation, the batch explanation, and the backward analysis.

I already had a minimal patch and regression tests ready.

The response was encouragingly simple: good catch, send the fix.

That was the point where I got a little excited.

Until then, most of the work had still felt like debugging my own library. Now the explanation was coherent all the way from a Hypothesis failure in Clifra to a specific coefficient in PyTorch's ATen implementation.

I opened PR [#196658](https://github.com/pytorch/pytorch/pull/196658#issuecomment-5637084109).

The actual production change was one line:

```diff
- constexpr scalar_t x7 = (89. - sqrt_177) / (5040. * x3);
+ constexpr scalar_t x7 = (89. - sqrt_177) / (5040. * x3 * x3);
```

Most of the PR discussion was about making the regression test smaller and cleaner.

I initially had separate forward and backward tests. During review, I was asked whether they could be combined and whether some existing matrix exponential tests could simply be extended instead. I checked those tests again; they covered similar degree ranges, but their tolerances were too loose to catch this particular regression. I kept the focused analytic case, merged the forward and backward checks into one test, and simplified a few details such as unnecessary tensor extraction and `contiguous()` calls.

PyTorch itself is a very large project, and even a one-line numerical correction ends up surrounded by a much larger build, test, and CI process than the patch suggests.

The PR was approved, the merge bot was invoked, and the fix landed. The current `LinearAlgebra.cpp` now contains the corrected `x3 * x3` denominator.

## Afterward

There is nothing especially exotic about the final fix.

A coefficient was copied incorrectly. A factor was missing. The patch was one line.

What made the bug interesting to me was the path to that line.

The original failure appeared inside a geometric-algebra library, in code involving layouts, actions, exponentials, and float32 precision. It would have been quite reasonable to keep adjusting Clifra's implementation, its tolerances, or its execution policy until the test stopped failing.

Instead, the odd shape of the failure mattered more than where it first appeared.

Batch dependence suggested dispatch.

Norm dependence suggested approximation thresholds.

The backward behavior suggested another call into the same numerical primitive.

And once those pieces were separated, the original Clifra code mostly disappeared from the reproducer.

In the end, Hypothesis had found a case that happened to cross a boundary far below the abstraction I was working on.

That is probably the part of the investigation I want to remember.