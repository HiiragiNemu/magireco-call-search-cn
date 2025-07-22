import os

def summarize_files_in_directory(root_dir):
    summary = {}
    file_count = 0

    # Walk through the directory and its subdirectories
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Get the directory name
        dir_name = os.path.basename(dirpath)
        # List all file names and extensions
        file_info = [(f, os.path.splitext(f)[1]) for f in filenames]
        # Store the directory and its files in the summary dictionary
        summary[dir_name] = file_info
        file_count += len(filenames)

    # Return the summary and total file count
    return summary, file_count

def print_summary(summary, total_files):
    for dir_name, files in summary.items():
        print(f"Directory: {dir_name}")
        for file_name, file_extension in files:
            print(f"  - File: {file_name}, Format: {file_extension}")
    print(f"\nTotal number of files: {total_files}")

if __name__ == "__main__":
    root_dir = '.'  # Current directory
    summary, total_files = summarize_files_in_directory(root_dir)
    print_summary(summary, total_files)
