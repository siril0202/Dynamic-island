using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace IslandTrimmer {
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
                            if (name.Contains("electron") || name.Contains("dynamic") || name.Contains("powershell")) {
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
