#!/usr/bin/env python3
"""
generate_fake_iocs.py

Produces synthetic domains.txt / files.txt / processes.txt / emails.txt
in the exact flat, newline-separated format that Amnesty's generate_stix.py
(AmnestyTech/investigations) expects as input.

This is for smoke-testing `mvt-ios check-iocs` end to end -- generate fake
inputs here, feed them through the REAL generate_stix.py to build a
pegasus.stix2 bundle, then point MVT at it. No real Pegasus/NSO indicators
or real device data are used anywhere in this path.

Usage:
    python3 scripts/generate_fake_iocs.py [--out-dir DIR] [--count N] [--seed N]
    pnpm gen:fake-iocs

Then, from the same directory as the generated .txt files:
    python3 generate_stix.py
"""
import argparse
import os
import random
import string


# All values below are synthetic markers, not real indicators.
# The 'test-fake-' / '.test.invalid' framing makes it obvious at a glance
# that nothing here is a genuine Pegasus/NSO IOC if it ever leaks into
# a real report or gets diffed against real data.

FAKE_TLDS = ["test.invalid", "example.test", "fakeioc.invalid"]

FAKE_PROCESS_TEMPLATES = [
    "test_fakeproc_{}",
    "com.test.fakedaemon.{}",
    "fake_bh_{}",  # mimics Pegasus 'BridgeHead'-style naming without reusing real names
    "notarealprocess_{}",
]

FAKE_FILE_TEMPLATES = [
    "test_fake_payload_{}.plist",
    "fakeioc_{}.db",
    "notreal_{}.js",
    "test_dropper_{}.bin",
]


def _rand_token(n=8):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def gen_domains(count, rng):
    out = set()
    while len(out) < count:
        sub = _rand_token(rng.randint(5, 10))
        tld = rng.choice(FAKE_TLDS)
        out.add(f"test-fake-{sub}.{tld}")
    return sorted(out)


def gen_processes(count, rng):
    out = set()
    while len(out) < count:
        template = rng.choice(FAKE_PROCESS_TEMPLATES)
        out.add(template.format(_rand_token(6)))
    return sorted(out)


def gen_files(count, rng):
    out = set()
    while len(out) < count:
        template = rng.choice(FAKE_FILE_TEMPLATES)
        out.add(template.format(_rand_token(6)))
    return sorted(out)


def gen_emails(count, rng):
    out = set()
    while len(out) < count:
        local = f"test-fake-{_rand_token(8)}"
        domain = rng.choice(FAKE_TLDS)
        out.add(f"{local}@{domain}")
    return sorted(out)


def write_lines(path, lines):
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    default_out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "fake_iocs")
    parser.add_argument("--out-dir", default=default_out_dir, help="Directory to write the four .txt files into")
    parser.add_argument("--count", type=int, default=5, help="Number of fake entries per category")
    parser.add_argument("--seed", type=int, default=None, help="Random seed, for reproducible test fixtures")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    os.makedirs(args.out_dir, exist_ok=True)

    domains = gen_domains(args.count, rng)
    processes = gen_processes(args.count, rng)
    files_ = gen_files(args.count, rng)
    emails = gen_emails(args.count, rng)

    write_lines(os.path.join(args.out_dir, "domains.txt"), domains)
    write_lines(os.path.join(args.out_dir, "processes.txt"), processes)
    write_lines(os.path.join(args.out_dir, "files.txt"), files_)
    write_lines(os.path.join(args.out_dir, "emails.txt"), emails)

    print(f"Wrote {args.count} fake entries each to domains.txt, processes.txt, "
          f"files.txt, emails.txt in {os.path.abspath(args.out_dir)}")
    print("Next: copy AmnestyTech's generate_stix.py into that directory and run it "
          "to build a fake pegasus.stix2 bundle.")


if __name__ == "__main__":
    main()
