# Blind-solving concepts used by JBLD

This guide explains the cube-solving language used by the application. It is written for readers who understand a normal 3x3 but may not know blindfolded solving.

## What a 3BLD solve contains

A blindfolded solve has two stages:

1. **Memo:** inspect the scrambled cube and remember a sequence of targets.
2. **Execution:** solve those targets while blindfolded, usually with short algorithms that move a small number of pieces.

JBLD focuses on execution analysis, but it reconstructs the target sequence as well. That makes it possible to compare what the scramble required, what the solver intended, and what the cube moves actually did.

## Pieces, stickers, and labels

A cubie is a physical piece. A corner has three stickers and an edge has two. Blind-solving notation names a sticker by the faces it touches:

- `UF` is the up sticker of the up-front edge.
- `FU` is the other sticker on that same physical edge.
- `UFR`, `FRU`, and `RUF` are the three stickers of one corner.

This distinction matters because permutation and orientation are separate. A piece may be in the correct slot but flipped or twisted, and the sticker tells the parser which orientation is present.

## Buffers

Edges and corners each use a fixed **buffer**. The buffer acts as the starting point for tracing cycles and as the piece exchanged by most blind-solving algorithms.

JBLD defaults to:

- `UF` for edges;
- `UFR` for corners.

Both are configurable. The parser compares pieces by physical identity, so alternate stickers on the configured buffer still count as the same buffer piece.

## Letter schemes and memo pairs

Solvers assign letters to stickers so a target sequence can be memorized as words or images. The default data uses the Speffz scheme, but JBLD stores the full sticker-to-letter mapping in settings.

A trace such as:

```text
UR -> UB -> FL -> DR
```

might become:

```text
B A L V
```

The letters are grouped into pairs (`BA`, `LV`) because most 3-style execution handles two targets after the buffer.

## Cycles and commutators

A scramble places pieces into cycles. Following the buffer tells the solver which target comes next. A typical 3-style algorithm is a **commutator**, commonly written as:

```text
[A, B] = A B A' B'
```

A setup or conjugate may wrap it:

```text
[S: [A, B]] = S A B A' B' S'
```

The algorithm library accepts both expanded moves and compact commutator notation. Import code normalizes brackets and repeated groups, then expands the notation for execution and comparison.

## Cycle breaks

If the buffer returns to its home piece while unsolved pieces remain elsewhere, the solver must start another cycle. The chosen target is a **cycle break**.

There is usually more than one valid choice. JBLD:

- ranks candidates using the configured cycle-break priority;
- excludes already solved pieces;
- records which targets were cycle breaks;
- exposes valid alternatives in the recommended solve;
- recalculates the remaining trace when the user chooses a different break.

The recommender swaps whole cubies in its working state after each target. This is important: changing only one sticker can create impossible states or loops such as repeatedly selecting the same letter.

## Flips and twists

A piece can be in its correct position but have the wrong orientation:

- an edge in that state is **flipped**;
- a corner in that state is **twisted**.

The label describes where the piece's reference sticker ended up. For a corner, that is its white or yellow (`U`/`D`) sticker. If the buffer is one of the affected pieces, its label is omitted because it is implied by the case.

For example, if a two-corner twist would be labelled `HM` and `M` belongs to the configured corner buffer, JBLD displays `H Twist`. The same rule changes a buffer-involving edge flip from `CX Flip` to `X Flip`.

Some three-corner twists are executed as two normal commutators. The move parser looks ahead after a corner comm and combines consecutive comms when:

- the same three physical corner pieces are involved; and
- their combined state fixes the piece positions but leaves the corners reoriented.

## Parity

An odd number of edge or corner targets cannot always be paired normally. In 3BLD this produces a **parity** case, usually handled by a dedicated algorithm or a pseudo-swap convention.

The parser recognizes the characteristic mixed edge/corner state and records parity separately. The recommender also detects odd target counts and identifies the parity target before grouping the remaining targets into pairs.

## Floating cycles

A **floating cycle** is a cycle that does not use the configured buffer. These appear in alternative methods and in some execution choices. JBLD can recognize clean floating corner cycles instead of forcing every state into a buffer-led interpretation.

## Reconstruction versus recommendation

These two views answer different questions:

- **Reconstruction:** What did the recorded moves do? It segments the actual execution and preserves move indices and timings.
- **Recommended solve:** What target sequence should solve this scramble under the current buffers, letter scheme, and cycle-break choices?

Comparing them helps isolate memo errors, wrong targets, execution mistakes, inefficient cycle breaks, and pauses between otherwise correct algorithms.

Continue with the [architecture guide](ARCHITECTURE.md) to see how these ideas are represented in code.
