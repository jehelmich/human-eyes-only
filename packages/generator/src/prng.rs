//! Seeded PRNG. The same construction as the planner's `createRng`, so a seed
//! string draws the same stream on both sides of the WASM boundary.
//!
//! Invariant 5: a fixed seed must reproduce a byte-identical transformation.
//! The vectors below were captured from `createRng` and are the only thing
//! asserting that the two implementations agree.

/// cyrb128. Hashes a seed into four 32-bit words.
///
/// Hashed over UTF-16 code units rather than bytes, because the JavaScript side
/// reads the seed with `charCodeAt` and the two must agree.
fn hash_seed(seed: &str) -> [u32; 4] {
    let mut h1: u32 = 1779033703;
    let mut h2: u32 = 3144134277;
    let mut h3: u32 = 1013904242;
    let mut h4: u32 = 2773480762;

    for k in seed.encode_utf16() {
        let k = k as u32;
        let n1 = h2 ^ (h1 ^ k).wrapping_mul(597399067);
        let n2 = h3 ^ (h2 ^ k).wrapping_mul(2869860233);
        let n3 = h4 ^ (h3 ^ k).wrapping_mul(951274213);
        let n4 = n1 ^ (h4 ^ k).wrapping_mul(2716044179);
        h1 = n1;
        h2 = n2;
        h3 = n3;
        h4 = n4;
    }

    [
        h3 ^ (h1 >> 18),
        h4 ^ (h2 >> 22),
        h1 ^ (h3 >> 17),
        h2 ^ (h4 >> 19),
    ]
}

/// sfc32.
pub struct Rng {
    a: u32,
    b: u32,
    c: u32,
    d: u32,
}

impl Rng {
    pub fn new(seed: &str) -> Self {
        let [a, b, c, d] = hash_seed(seed);
        let mut rng = Rng { a, b, c, d };
        // sfc32 needs a warm-up before its output is well distributed.
        for _ in 0..12 {
            rng.next_u32();
        }
        rng
    }

    fn next_u32(&mut self) -> u32 {
        let t = self.a.wrapping_add(self.b);
        self.a = self.b ^ (self.b >> 9);
        self.b = self.c.wrapping_add(self.c << 3);
        self.c = self.c.rotate_left(21);
        self.d = self.d.wrapping_add(1);
        let t = t.wrapping_add(self.d);
        self.c = self.c.wrapping_add(t);
        t
    }

    /// Uniform in [0, 1).
    pub fn next(&mut self) -> f64 {
        f64::from(self.next_u32()) / 4294967296.0
    }

    /// Uniform in [-1, 1).
    pub fn signed(&mut self) -> f64 {
        self.next() * 2.0 - 1.0
    }

    /// Uniform integer in [0, max_exclusive).
    pub fn int(&mut self, max_exclusive: usize) -> usize {
        if max_exclusive == 0 {
            return 0;
        }
        (self.next() * max_exclusive as f64) as usize
    }

    /// Fisher-Yates, in place. Matches the planner's `shuffle`.
    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = self.int(i + 1);
            items.swap(i, j);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Rng;

    /// Captured from the planner's `createRng` in `packages/core`. Invariant 5
    /// says a fixed seed reproduces a byte-identical transformation, and a
    /// carrier is generated on one side of the WASM boundary and placed on the
    /// other — so the two implementations have to draw the same stream, and
    /// this is the only thing that says they do.
    #[test]
    fn draws_the_same_stream_as_the_planner() {
        let cases: [(&str, [u32; 4]); 3] = [
            ("heo", [1365537051, 482404510, 3096373515, 3960094147]),
            (
                "heo/carrier 0",
                [1763141260, 3115019997, 4142806734, 2821726134],
            ),
            ("", [1185182619, 829818578, 484719545, 904993473]),
        ];
        for (seed, expected) in cases {
            let mut rng = Rng::new(seed);
            let drawn: Vec<u32> = (0..4).map(|_| (rng.next() * 4294967296.0) as u32).collect();
            assert_eq!(drawn, expected, "seed {seed:?}");
        }
    }

    #[test]
    fn shuffles_the_same_way_as_the_planner() {
        let mut items = [0, 1, 2, 3, 4, 5, 6, 7];
        Rng::new("shuffle").shuffle(&mut items);
        assert_eq!(items, [5, 7, 0, 4, 3, 1, 6, 2]);
    }
}
