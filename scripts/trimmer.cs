using System;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;

[assembly: AssemblyTitle("CodeWithSiril Dynamic Island Memory Trimmer")]
[assembly: AssemblyDescription("Background working set compaction tool for CodeWithSiril Dynamic Island")]
[assembly: AssemblyCompany("CodeWithSiril")]
[assembly: AssemblyProduct("CodeWithSiril Dynamic Island")]
[assembly: AssemblyCopyright("Copyright © 2026 CodeWithSiril")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace CodeWithSiril.DynamicIsland.Trimmer {
    class Program {
        [DllImport("psapi.dll")]
        public static extern int EmptyWorkingSet(IntPtr hwProc);

        [DllImport("kernel32.dll")]
        public static extern bool SetProcessWorkingSetSize(IntPtr hProcess, int dwMinimumWorkingSetSize, int dwMaximumWorkingSetSize);

        static void Main(string[] args) {
            try {
                if (args.Length > 0) {
                    foreach (var arg in args) {
                        int pid;
                        if (int.TryParse(arg, out pid)) {
                            try {
                                using (var p = Process.GetProcessById(pid)) {
                                    EmptyWorkingSet(p.Handle);
                                    SetProcessWorkingSetSize(p.Handle, -1, -1);
                                }
                            } catch {}
                        }
                    }
                } else {
                    foreach (var p in Process.GetProcesses()) {
                        try {
                            string name = p.ProcessName.ToLower();
                            if (name.Contains("electron") || name.Contains("dynamic") || name.Contains("powershell") || name.Contains("codewithsiril")) {
                                EmptyWorkingSet(p.Handle);
                                SetProcessWorkingSetSize(p.Handle, -1, -1);
                            }
                        } catch {}
                        finally {
                            try { p.Dispose(); } catch {}
                        }
                    }
                }
            } catch {}
        }
    }
}
