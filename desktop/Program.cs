using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace PartyGamesLauncher
{
    static class Program
    {
        public static string DefaultServerUrl = "https://party-games-b3bm.onrender.com";

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string targetUrl = DefaultServerUrl;

            // 1. 优先读取命令行参数
            if (args.Length > 0 && !string.IsNullOrEmpty(args[0]))
            {
                targetUrl = args[0];
            }
            else
            {
                // 2. 读取同目录下 config.json (若存在)
                try
                {
                    string configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json");
                    if (File.Exists(configPath))
                    {
                        string content = File.ReadAllText(configPath);
                        int idx = content.IndexOf("\"serverUrl\":");
                        if (idx >= 0)
                        {
                            int start = content.IndexOf("\"", idx + 12) + 1;
                            int end = content.IndexOf("\"", start);
                            if (start > 0 && end > start)
                            {
                                string url = content.Substring(start, end - start).Trim();
                                if (url.StartsWith("http")) targetUrl = url;
                            }
                        }
                    }
                }
                catch { }
            }

            // 启动加载检查窗口
            Application.Run(new SplashForm(targetUrl));
        }
    }

    public class SplashForm : Form
    {
        private string targetUrl;
        private Label lblTitle;
        private Label lblStatus;
        private Label lblHint;
        private ProgressBar progressBar;
        private Button btnDirectOpen;
        private Button btnChangeUrl;
        private System.Windows.Forms.Timer animTimer;
        private int dotCount = 0;

        public SplashForm(string url)
        {
            this.targetUrl = url;

            this.Text = "聚会游戏盒子 - 正在启动";
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.ClientSize = new Size(520, 280);
            this.BackColor = Color.FromArgb(24, 24, 37); // 深夜派对渐变紫暗色

            // 尝试载入图标
            try
            {
                string icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app.ico");
                if (File.Exists(icoPath)) this.Icon = new Icon(icoPath);
            }
            catch { }

            // 游戏大标题
            lblTitle = new Label();
            lblTitle.Text = "🎮 聚会游戏盒子 (Party Games Hub)";
            lblTitle.Font = new Font("Microsoft YaHei UI", 15F, FontStyle.Bold);
            lblTitle.ForeColor = Color.FromArgb(243, 244, 246);
            lblTitle.Location = new Point(20, 30);
            lblTitle.Size = new Size(480, 40);
            lblTitle.TextAlign = ContentAlignment.MiddleCenter;
            this.Controls.Add(lblTitle);

            // 连接状态文字
            lblStatus = new Label();
            lblStatus.Text = "正在连接云端服务器...";
            lblStatus.Font = new Font("Microsoft YaHei UI", 11F, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(167, 139, 250); // 柔和紫色
            lblStatus.Location = new Point(20, 85);
            lblStatus.Size = new Size(480, 30);
            lblStatus.TextAlign = ContentAlignment.MiddleCenter;
            this.Controls.Add(lblStatus);

            // 进度条
            progressBar = new ProgressBar();
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.MarqueeAnimationSpeed = 30;
            progressBar.Location = new Point(50, 130);
            progressBar.Size = new Size(420, 12);
            this.Controls.Add(progressBar);

            // 温馨提示文字（Render 冷启动说明）
            lblHint = new Label();
            lblHint.Text = "💡 提示：公网服务器休眠中首次唤醒约需 15~30 秒，请稍候...";
            lblHint.Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular);
            lblHint.ForeColor = Color.FromArgb(156, 163, 175);
            lblHint.Location = new Point(20, 155);
            lblHint.Size = new Size(480, 45);
            lblHint.TextAlign = ContentAlignment.MiddleCenter;
            this.Controls.Add(lblHint);

            // 操作按钮行：直接打开 & 切换地址
            btnDirectOpen = new Button();
            btnDirectOpen.Text = "跳过检测直接进入";
            btnDirectOpen.Font = new Font("Microsoft YaHei UI", 9F);
            btnDirectOpen.ForeColor = Color.FromArgb(229, 231, 235);
            btnDirectOpen.BackColor = Color.FromArgb(55, 65, 81);
            btnDirectOpen.FlatStyle = FlatStyle.Flat;
            btnDirectOpen.FlatAppearance.BorderSize = 0;
            btnDirectOpen.Location = new Point(110, 215);
            btnDirectOpen.Size = new Size(140, 35);
            btnDirectOpen.Click += (s, e) => LaunchAndClose();
            this.Controls.Add(btnDirectOpen);

            btnChangeUrl = new Button();
            btnChangeUrl.Text = "修改服务器地址";
            btnChangeUrl.Font = new Font("Microsoft YaHei UI", 9F);
            btnChangeUrl.ForeColor = Color.FromArgb(229, 231, 235);
            btnChangeUrl.BackColor = Color.FromArgb(55, 65, 81);
            btnChangeUrl.FlatStyle = FlatStyle.Flat;
            btnChangeUrl.FlatAppearance.BorderSize = 0;
            btnChangeUrl.Location = new Point(270, 215);
            btnChangeUrl.Size = new Size(140, 35);
            btnChangeUrl.Click += (s, e) => ShowChangeUrlDialog();
            this.Controls.Add(btnChangeUrl);

            // 文字动画计时器
            animTimer = new System.Windows.Forms.Timer();
            animTimer.Interval = 500;
            animTimer.Tick += (s, e) =>
            {
                dotCount = (dotCount + 1) % 4;
                string dots = new string('.', dotCount);
                if (lblStatus.Text.StartsWith("正在连接云端服务器"))
                {
                    lblStatus.Text = "正在连接云端服务器" + dots;
                }
            };
            animTimer.Start();

            // 启动异步线程检测服务端连通性
            Thread checkThread = new Thread(CheckServerHealth);
            checkThread.IsBackground = true;
            checkThread.Start();
        }

        private void CheckServerHealth()
        {
            int maxRetries = 25; // 约 50 秒
            int retry = 0;
            bool success = false;

            while (retry < maxRetries)
            {
                try
                {
                    ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls;
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(targetUrl);
                    request.Method = "GET";
                    request.Timeout = 6000;
                    request.UserAgent = "PartyGamesDesktopClient/1.0";

                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    {
                        if (response.StatusCode == HttpStatusCode.OK)
                        {
                            success = true;
                            break;
                        }
                    }
                }
                catch
                {
                    retry++;
                    Thread.Sleep(2000);
                }
            }

            this.BeginInvoke((MethodInvoker)delegate
            {
                if (success)
                {
                    lblStatus.Text = "✅ 服务器连接成功，正在打开游戏...";
                    lblStatus.ForeColor = Color.FromArgb(52, 211, 153);
                    System.Windows.Forms.Timer t = new System.Windows.Forms.Timer();
                    t.Interval = 500;
                    t.Tick += (s, e) =>
                    {
                        t.Stop();
                        LaunchAndClose();
                    };
                    t.Start();
                }
                else
                {
                    lblStatus.Text = "⚠️ 暂时未连通服务器，正在尝试直接启动...";
                    lblStatus.ForeColor = Color.FromArgb(251, 191, 36);
                    LaunchAndClose();
                }
            });
        }

        private void ShowChangeUrlDialog()
        {
            Form prompt = new Form()
            {
                Width = 480,
                Height = 180,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                Text = "设置服务器地址 (公网或局域网 IP)",
                StartPosition = FormStartPosition.CenterParent,
                BackColor = Color.FromArgb(30, 30, 46)
            };
            Label textLabel = new Label() { Left = 20, Top = 20, Width = 420, Text = "请输入聚会游戏服务器地址 (例如 http://192.168.1.4:3000):", ForeColor = Color.White };
            TextBox textBox = new TextBox() { Left = 20, Top = 50, Width = 420, Text = this.targetUrl };
            Button confirmation = new Button() { Text = "确定", Left = 240, Width = 90, Top = 90, DialogResult = DialogResult.OK, ForeColor = Color.White, BackColor = Color.FromArgb(99, 102, 241), FlatStyle = FlatStyle.Flat };
            Button cancel = new Button() { Text = "取消", Left = 350, Width = 90, Top = 90, DialogResult = DialogResult.Cancel, ForeColor = Color.White, BackColor = Color.FromArgb(55, 65, 81), FlatStyle = FlatStyle.Flat };

            prompt.Controls.Add(textBox);
            prompt.Controls.Add(confirmation);
            prompt.Controls.Add(cancel);
            prompt.Controls.Add(textLabel);
            prompt.AcceptButton = confirmation;
            prompt.CancelButton = cancel;

            if (prompt.ShowDialog() == DialogResult.OK)
            {
                string input = textBox.Text.Trim();
                if (!string.IsNullOrEmpty(input) && input.StartsWith("http"))
                {
                    this.targetUrl = input;
                    lblStatus.Text = "正在连接新服务器: " + input;
                    // 保存到 config.json
                    try
                    {
                        string configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json");
                        File.WriteAllText(configPath, "{\n  \"serverUrl\": \"" + input + "\"\n}");
                    }
                    catch { }

                    Thread t = new Thread(CheckServerHealth);
                    t.IsBackground = true;
                    t.Start();
                }
            }
        }

        private void LaunchAndClose()
        {
            try
            {
                animTimer.Stop();

                // 独立用户数据存储目录，防止和普通浏览器缓存冲突
                string userDataDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "PartyGamesApp",
                    "UserData"
                );

                string edgeArgs = string.Format(
                    "--app=\"{0}\" --window-size=1280,820 --user-data-dir=\"{1}\" --disable-features=Translate",
                    targetUrl,
                    userDataDir
                );

                // 查找系统中的 Edge 可执行文件
                string edgePath = FindEdgePath();

                if (!string.IsNullOrEmpty(edgePath) && File.Exists(edgePath))
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = edgePath;
                    psi.Arguments = edgeArgs;
                    psi.UseShellExecute = false;
                    Process.Start(psi);
                }
                else
                {
                    // 降级使用 Chrome
                    string chromePath = FindChromePath();
                    if (!string.IsNullOrEmpty(chromePath) && File.Exists(chromePath))
                    {
                        ProcessStartInfo psi = new ProcessStartInfo();
                        psi.FileName = chromePath;
                        psi.Arguments = edgeArgs;
                        psi.UseShellExecute = false;
                        Process.Start(psi);
                    }
                    else
                    {
                        // 降级使用默认系统浏览器
                        Process.Start(new ProcessStartInfo(targetUrl) { UseShellExecute = true });
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("启动客户端发生异常: " + ex.Message, "启动错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                this.Close();
            }
        }

        private string FindEdgePath()
        {
            string[] possiblePaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe")
            };

            foreach (string p in possiblePaths)
            {
                if (File.Exists(p)) return p;
            }
            return null;
        }

        private string FindChromePath()
        {
            string[] possiblePaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe")
            };

            foreach (string p in possiblePaths)
            {
                if (File.Exists(p)) return p;
            }
            return null;
        }
    }
}
