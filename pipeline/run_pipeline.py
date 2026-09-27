"""Entry point for the data pipeline.

    python pipeline/run_pipeline.py
    python pipeline/run_pipeline.py --refresh
"""

from build_dataset import main
import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download, clean, and score City of Pittsburgh parcels")
    parser.add_argument("--refresh", action="store_true", help="Ignore cached raw downloads")
    args = parser.parse_args()
    main(refresh=args.refresh)
