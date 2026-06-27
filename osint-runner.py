#!/usr/bin/env python3
"""OSINT runner for IseeU — wraps Maigret and Holehe, outputs JSON to stdout."""
import sys, json, os

os.environ["PYTHONIOENCODING"] = "utf-8"

def run_holehe_cli(email):
    """Check email registration across 120+ sites using Holehe CLI."""
    results = []
    try:
        import subprocess, os
        scripts_dir = os.environ.get("SCRIPTS_DIR", r"C:\Users\Gr33k\AppData\Local\Programs\Python\Python314\Scripts")
        holehe_exe = os.path.join(scripts_dir, "holehe.exe")
        if not os.path.exists(holehe_exe):
            holehe_exe = os.path.join(scripts_dir, "holehe")

        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"

        proc = subprocess.run(
            [holehe_exe, email, "--no-color", "--no-clear", "-NP"],
            capture_output=True, text=True, timeout=60,
            encoding="utf-8", errors="replace", env=env
        )

        for line in proc.stdout.split("\n"):
            line = line.strip()
            if line.startswith("[+]"):
                site = line[3:].strip()
                results.append({"platform": site, "found": True, "url": site, "cat": "Email Registration"})
            elif line.startswith("[-]"):
                site = line[3:].strip()
                results.append({"platform": site, "found": False, "url": site, "cat": "Email Registration"})
    except Exception as e:
        results.append({"error": str(e)})
    return results

def run_maigret_sync(username, top_sites=0):
    """Check username across 3000+ sites using Maigret."""
    results = []
    try:
        import subprocess, tempfile, os
        scripts_dir = os.environ.get("SCRIPTS_DIR", r"C:\Users\Gr33k\AppData\Local\Programs\Python\Python314\Scripts")
        maigret_exe = os.path.join(scripts_dir, "maigret.exe")
        if not os.path.exists(maigret_exe):
            maigret_exe = os.path.join(scripts_dir, "maigret")

        with tempfile.TemporaryDirectory() as tmpdir:
            cmd = [
                maigret_exe, username,
                "--timeout", "10",
                "--no-progressbar", "--no-color",
                "-J", "simple",
                "--folderoutput", tmpdir,
            ]
            if top_sites > 0:
                cmd.extend(["--top-sites", str(top_sites)])
            else:
                cmd.append("-a")

            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"

            proc = subprocess.run(
                cmd, capture_output=True, text=True, timeout=300,
                encoding="utf-8", errors="replace", env=env
            )

            json_file = os.path.join(tmpdir, f"report_{username}_simple.json")
            if os.path.exists(json_file):
                with open(json_file, "r", encoding="utf-8", errors="replace") as f:
                    data = json.load(f)

                for site_name, site_data in data.items():
                    status = site_data.get("status", {})
                    if isinstance(status, dict) and status.get("status") == "Claimed":
                        ids = status.get("ids", {})
                        results.append({
                            "platform": site_name,
                            "found": True,
                            "url": site_data.get("url_user", ""),
                            "avatar": ids.get("image", None),
                            "fullname": ids.get("fullname", None),
                            "location": ids.get("location", None),
                            "bio": ids.get("bio", None),
                            "followers": ids.get("follower_count", None),
                            "following": ids.get("following_count", None),
                            "created": ids.get("created_at", None),
                            "uid": ids.get("uid", None),
                            "cat": ", ".join(site_data.get("site", {}).get("tags", [])) or "Other",
                            "rank": site_data.get("rank", 999999),
                            "verified": True,
                        })
    except subprocess.TimeoutExpired:
        results.append({"error": "Maigret timed out after 300s"})
    except Exception as e:
        results.append({"error": str(e)})

    results.sort(key=lambda x: x.get("rank", 999999))
    return results


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: osint-runner.py <type> <query> [top_sites]"}))
        sys.exit(1)

    search_type = sys.argv[1]
    query = sys.argv[2]
    top_sites = int(sys.argv[3]) if len(sys.argv) > 3 else 0

    output = {"type": search_type, "query": query, "results": []}

    if search_type == "email":
        holehe_results = run_holehe_cli(query)
        output["holehe"] = holehe_results
        output["holehe_found"] = [r for r in holehe_results if r.get("found")]
        output["holehe_total"] = len(holehe_results)

    elif search_type == "username":
        maigret_results = run_maigret_sync(query, top_sites)
        output["maigret"] = maigret_results
        output["maigret_found"] = len([r for r in maigret_results if r.get("found")])
        output["maigret_total"] = top_sites if top_sites > 0 else 3166

    elif search_type == "name":
        # For name, try as username (no spaces)
        slug = query.lower().replace(" ", "")
        maigret_results = run_maigret_sync(slug, top_sites)
        output["maigret"] = maigret_results
        output["maigret_found"] = len([r for r in maigret_results if r.get("found")])

    print(json.dumps(output, ensure_ascii=False, default=str))
