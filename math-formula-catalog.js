"use strict";

(function attachMathFormulaCatalog(root, factory) {
  const catalog = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = catalog;
  if (root) root.MathFormulaCatalog = catalog;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMathFormulaCatalog() {
  const VERSION = 3;
  const sectionTuples = [
    ["math-v3-limits", "高数 · 极限与连续", "indigo"],
    ["math-v3-derivatives", "高数 · 导数与微分", "teal"],
    ["math-v3-mean-value-taylor", "高数 · 中值定理与泰勒", "orange"],
    ["math-v3-integrals", "高数 · 一元函数积分", "rose"],
    ["math-v3-multivariable", "高数 · 多元函数微分", "violet"],
    ["math-v3-multiple-integrals", "高数 · 重积分", "cyan"],
    ["math-v3-curves-surfaces", "高数 · 曲线与曲面积分", "indigo"],
    ["math-v3-differential-equations", "高数 · 微分方程", "teal"],
    ["math-v3-series", "高数 · 无穷级数", "orange"],
    ["math-v3-space-geometry", "高数 · 空间解析几何", "rose"],
    ["math-v3-determinants-matrices", "线代 · 行列式与矩阵", "violet"],
    ["math-v3-vectors-equations", "线代 · 向量与方程组", "cyan"],
    ["math-v3-eigen-quadratic", "线代 · 特征值与二次型", "indigo"],
    ["math-v3-probability", "概率 · 基本公式", "teal"],
    ["math-v3-distributions", "概率 · 随机变量与分布", "orange"],
    ["math-v3-random-vectors", "概率 · 多维随机变量", "rose"],
    ["math-v3-moments-limits", "概率 · 数字特征与极限定理", "violet"],
    ["math-v3-statistics", "统计 · 抽样分布与估计", "cyan"]
  ];
  const SECTIONS = sectionTuples.map(([id, title, color], order) => ({ id, subjectId: "math", title, color, order, archived: false }));
  const sectionOrders = new Map(SECTIONS.map((section) => [section.id, 0]));
  const CARDS = [];

  function add(sectionId, id, title, prompt, markdown, tags, kind = "formula") {
    const order = sectionOrders.get(sectionId) || 0;
    sectionOrders.set(sectionId, order + 1);
    CARDS.push({
      id: `math-v3-${id}`,
      subjectId: "math",
      sectionId,
      kind,
      title,
      prompt,
      markdown,
      tags,
      order,
      archived: false,
      checkable: true
    });
  }

  add("math-v3-limits", "limit-core", "两个重要极限", "看到三角小量或“1 的无穷次幂”，先匹配两个基本极限。", String.raw`### 三角极限

\[
\lim_{x\to0}\frac{\sin x}{x}=1
\]

### 指数型极限

\[
\lim_{x\to0}(1+x)^{1/x}=e,\qquad
\lim_{n\to\infty}\left(1+\frac1n\right)^n=e
\]

更一般地，若 \(u(x)\to0\)、\(v(x)\to\infty\)、\(u(x)v(x)\to A\)，则

\[
(1+u(x))^{v(x)}\to e^A.
\]`, ["高数", "极限", "重要极限", "e"]);

  add("math-v3-limits", "equivalent-infinitesimals", "常用等价无穷小", "只在乘除关系中直接替换；加减式先提取主项。", String.raw`当 \(x\to0\) 时：

\[
\sin x\sim x,\quad \tan x\sim x,\quad \arcsin x\sim x,\quad \arctan x\sim x
\]

\[
e^x-1\sim x,\quad \ln(1+x)\sim x,\quad a^x-1\sim x\ln a\quad(a>0,a\ne1)
\]

\[
1-\cos x\sim\frac{x^2}{2},\qquad (1+x)^\alpha-1\sim\alpha x
\]

\[
x-\sin x\sim\frac{x^3}{6},\qquad \tan x-x\sim\frac{x^3}{3}
\]`, ["高数", "极限", "等价无穷小"]);

  add("math-v3-limits", "limit-tools", "极限运算与洛必达", "先化型、再等价或展开；只有未定式才使用洛必达。", String.raw`### 常见未定式

\[
\frac00,\ \frac\infty\infty,\ 0\cdot\infty,\ \infty-\infty,\ 1^\infty,\ 0^0,\ \infty^0
\]

### 洛必达法则

在满足可导性与相应极限条件时：

\[
\lim\frac{f(x)}{g(x)}=\lim\frac{f'(x)}{g'(x)}
\]

### 无穷小阶数

\[
\lim\frac{\alpha}{\beta}=0\Rightarrow\alpha=o(\beta),\qquad
\lim\frac{\alpha}{\beta}=c\ne0\Rightarrow\alpha\text{ 与 }\beta\text{ 同阶}
\]`, ["高数", "极限", "洛必达", "无穷小"]);

  add("math-v3-derivatives", "derivative-table", "基本初等函数导数表", "先识别外层函数，再乘内层导数。", String.raw`\[
(x^\alpha)'=\alpha x^{\alpha-1},\quad (e^x)'=e^x,\quad (a^x)'=a^x\ln a
\]

\[
(\ln x)'=\frac1x,\quad (\log_a x)'=\frac1{x\ln a}
\]

\[
(\sin x)'=\cos x,\quad (\cos x)'=-\sin x
\]

\[
(\tan x)'=\sec^2x,\quad (\cot x)'=-\csc^2x
\]

\[
(\arcsin x)'=\frac1{\sqrt{1-x^2}},\quad
(\arccos x)'=-\frac1{\sqrt{1-x^2}},\quad
(\arctan x)'=\frac1{1+x^2}
\]`, ["高数", "导数", "初等函数"]);

  add("math-v3-derivatives", "derivative-rules", "复合、隐式与参数求导", "普通复合用链式；关系式用隐式；参数方程先除后再求导。", String.raw`### 运算法则

\[
(uv)'=u'v+uv',\qquad
\left(\frac uv\right)'=\frac{u'v-uv'}{v^2},\qquad
[f(g(x))]'=f'(g(x))g'(x)
\]

### 隐函数 \(F(x,y)=0\)

\[
\frac{dy}{dx}=-\frac{F_x}{F_y}
\]

### 参数方程 \(x=x(t),y=y(t)\)

\[
\frac{dy}{dx}=\frac{dy/dt}{dx/dt},\qquad
\frac{d^2y}{dx^2}=\frac{d}{dt}\left(\frac{dy}{dx}\right)\Big/\frac{dx}{dt}
\]

### 对数求导

\[
y=u(x)^{v(x)}\Rightarrow \frac{y'}y=v'\ln u+v\frac{u'}u
\]`, ["高数", "导数", "链式法则", "隐函数", "参数方程"]);

  add("math-v3-derivatives", "higher-geometry", "高阶导数、微分与曲率", "高阶乘积看二项式系数；几何题先写切线与曲率。", String.raw`### 莱布尼茨公式

\[
(uv)^{(n)}=\sum_{k=0}^{n}\binom{n}{k}u^{(k)}v^{(n-k)}
\]

### 微分

\[
dy=f'(x)\,dx,\qquad \Delta y=f'(x)\Delta x+o(\Delta x)
\]

### 切线与法线

\[
y-y_0=f'(x_0)(x-x_0),\qquad
y-y_0=-\frac1{f'(x_0)}(x-x_0)
\]

### 曲率

\[
K=\frac{|y''|}{(1+y'^2)^{3/2}},\qquad \rho=\frac1K
\]`, ["高数", "高阶导数", "微分", "切线", "曲率"]);

  add("math-v3-mean-value-taylor", "mean-value-theorems", "三大微分中值定理", "先核对闭区间连续、开区间可导，再选择 Rolle、Lagrange 或 Cauchy。", String.raw`### Rolle 定理

\[
f(a)=f(b)\Rightarrow \exists\xi\in(a,b),\ f'(\xi)=0
\]

### Lagrange 中值定理

\[
f(b)-f(a)=f'(\xi)(b-a)
\]

### Cauchy 中值定理

\[
\frac{f(b)-f(a)}{g(b)-g(a)}=\frac{f'(\xi)}{g'(\xi)}
\]`, ["高数", "中值定理", "Rolle", "Lagrange", "Cauchy"]);

  add("math-v3-mean-value-taylor", "taylor", "泰勒公式与余项", "先确定展开点与所需阶数；估误差时写拉格朗日余项。", String.raw`\[
f(x)=\sum_{k=0}^{n}\frac{f^{(k)}(a)}{k!}(x-a)^k+R_n(x)
\]

### Peano 余项

\[
R_n(x)=o((x-a)^n)
\]

### Lagrange 余项

\[
R_n(x)=\frac{f^{(n+1)}(\xi)}{(n+1)!}(x-a)^{n+1}
\]`, ["高数", "泰勒", "余项", "Peano", "Lagrange"]);

  add("math-v3-mean-value-taylor", "maclaurin", "常用麦克劳林展开", "极限题按最低非零阶保留；复合小量先确认其趋于 0。", String.raw`\[
e^x=1+x+\frac{x^2}{2!}+\frac{x^3}{3!}+\cdots
\]

\[
\sin x=x-\frac{x^3}{3!}+\frac{x^5}{5!}-\cdots,\quad
\cos x=1-\frac{x^2}{2!}+\frac{x^4}{4!}-\cdots
\]

\[
\ln(1+x)=x-\frac{x^2}{2}+\frac{x^3}{3}-\cdots
\]

\[
(1+x)^\alpha=1+\alpha x+\frac{\alpha(\alpha-1)}{2!}x^2+\cdots
\]

\[
\frac1{1-x}=1+x+x^2+\cdots,\qquad
\arctan x=x-\frac{x^3}{3}+\frac{x^5}{5}-\cdots
\]`, ["高数", "麦克劳林", "常用展开"]);

  add("math-v3-integrals", "primitive-table", "基本积分表", "先把被积式化成基本函数的导数形式。", String.raw`\[
\int x^\alpha dx=\frac{x^{\alpha+1}}{\alpha+1}+C\ (\alpha\ne-1),\qquad
\int\frac{dx}{x}=\ln|x|+C
\]

\[
\int e^x dx=e^x+C,\qquad \int a^x dx=\frac{a^x}{\ln a}+C
\]

\[
\int\sin x\,dx=-\cos x+C,\quad \int\cos x\,dx=\sin x+C
\]

\[
\int\sec^2x\,dx=\tan x+C,\quad \int\csc^2x\,dx=-\cot x+C
\]

\[
\int\frac{dx}{1+x^2}=\arctan x+C,\qquad
\int\frac{dx}{\sqrt{1-x^2}}=\arcsin x+C
\]`, ["高数", "不定积分", "积分表"]);

  add("math-v3-integrals", "integration-methods", "换元与分部积分", "含复合导数先换元；多项式乘指数/三角/对数优先分部。", String.raw`### 第一类换元

\[
\int f(\varphi(x))\varphi'(x)\,dx=\int f(u)\,du
\]

### 第二类换元

\[
x=\varphi(t)\Rightarrow \int f(x)\,dx=\int f(\varphi(t))\varphi'(t)\,dt
\]

### 分部积分

\[
\int u\,dv=uv-\int v\,du
\]

定积分形式：

\[
\int_a^b u\,dv=[uv]_a^b-\int_a^b v\,du
\]`, ["高数", "积分", "换元", "分部积分"]);

  add("math-v3-integrals", "definite-ftc", "定积分性质与牛顿—莱布尼茨", "遇到对称区间先判奇偶；变上限积分先按链式法则求导。", String.raw`\[
\int_a^b f(x)\,dx=F(b)-F(a),\qquad F'=f
\]

\[
\frac{d}{dx}\int_a^{g(x)}f(t)\,dt=f(g(x))g'(x)
\]

\[
\frac{d}{dx}\int_{u(x)}^{v(x)}f(t)\,dt=f(v(x))v'(x)-f(u(x))u'(x)
\]

### 对称性

\[
\int_{-a}^{a}f(x)dx=
\begin{cases}
0,&f\text{ 为奇函数},\\
2\int_0^a f(x)dx,&f\text{ 为偶函数}.
\end{cases}
\]

\[
\int_0^a f(x)dx=\int_0^a f(a-x)dx
\]`, ["高数", "定积分", "牛顿莱布尼茨", "对称性"]);

  add("math-v3-integrals", "improper-applications", "反常积分与几何应用", "反常积分先找瑕点或无穷端；几何量先选直角、参数或极坐标表达。", String.raw`### \(p\) 型判别

\[
\int_1^{\infty}\frac{dx}{x^p}\text{ 收敛}\Longleftrightarrow p>1
\]

\[
\int_0^1\frac{dx}{x^p}\text{ 收敛}\Longleftrightarrow p<1
\]

### 平面面积与旋转体体积

\[
A=\int_a^b |f(x)-g(x)|dx
\]

\[
V_x=\pi\int_a^b(R^2-r^2)dx,\qquad V_y=2\pi\int_a^b x f(x)dx
\]

### 弧长

\[
L=\int_a^b\sqrt{1+[f'(x)]^2}\,dx
\]`, ["高数", "反常积分", "面积", "体积", "弧长"]);

  add("math-v3-multivariable", "partial-total", "偏导数与全微分", "偏导冻结其他变量；判断可微时使用线性主部。", String.raw`对 \(z=f(x,y)\)：

\[
dz=f_x\,dx+f_y\,dy
\]

可微的增量形式：

\[
\Delta z=f_x\Delta x+f_y\Delta y+o(\rho),\qquad
\rho=\sqrt{(\Delta x)^2+(\Delta y)^2}
\]

二阶全微分：

\[
d^2z=f_{xx}dx^2+2f_{xy}dxdy+f_{yy}dy^2
\]`, ["高数", "多元函数", "偏导数", "全微分"]);

  add("math-v3-multivariable", "multivariable-chain", "多元复合与隐函数求导", "先画变量依赖关系；每条路径的偏导乘积相加。", String.raw`若 \(z=f(u,v)\)，\(u=u(x,y),v=v(x,y)\)，则

\[
z_x=f_u u_x+f_v v_x,\qquad z_y=f_u u_y+f_v v_y
\]

若 \(F(x,y,z)=0\) 确定 \(z=z(x,y)\)，则

\[
z_x=-\frac{F_x}{F_z},\qquad z_y=-\frac{F_y}{F_z}
\]`, ["高数", "多元复合", "隐函数", "链式法则"]);

  add("math-v3-multivariable", "gradient-extrema", "方向导数、梯度与多元极值", "方向导数看梯度投影；条件极值写拉格朗日方程。", String.raw`### 方向导数与梯度

\[
D_{\boldsymbol l}f=\nabla f\cdot\boldsymbol l=f_x\cos\alpha+f_y\cos\beta
\]

\[
\nabla f=(f_x,f_y),\qquad \max_{|\boldsymbol l|=1}D_{\boldsymbol l}f=|\nabla f|
\]

### 二元函数极值判别

\[
A=f_{xx},\ B=f_{xy},\ C=f_{yy},\quad \Delta=AC-B^2
\]

\(\Delta>0,A>0\) 为极小；\(\Delta>0,A<0\) 为极大；\(\Delta<0\) 非极值。

### Lagrange 乘子

\[
\nabla f=\lambda\nabla g
\]`, ["高数", "方向导数", "梯度", "多元极值", "Lagrange"]);

  add("math-v3-multiple-integrals", "double-integral", "二重积分与极坐标", "区域由圆或扇形描述时，优先换极坐标并补上 Jacobian 因子 \(r\)。", String.raw`### 直角坐标

\[
\iint_D f(x,y)d\sigma=\int_a^b dx\int_{\varphi_1(x)}^{\varphi_2(x)}f(x,y)dy
\]

### 极坐标

\[
x=r\cos\theta,\quad y=r\sin\theta,\quad d\sigma=r\,dr\,d\theta
\]

\[
\iint_D f(x,y)d\sigma=\iint_{D'}f(r\cos\theta,r\sin\theta)r\,dr\,d\theta
\]`, ["高数", "二重积分", "极坐标", "Jacobian"]);

  add("math-v3-multiple-integrals", "triple-integral", "三重积分、柱坐标与球坐标", "旋转体用柱坐标；球域或锥面用球坐标。", String.raw`### 柱坐标

\[
x=r\cos\theta,\ y=r\sin\theta,\ z=z,\qquad dV=r\,dr\,d\theta\,dz
\]

### 球坐标

\[
x=\rho\sin\varphi\cos\theta,\quad y=\rho\sin\varphi\sin\theta,\quad z=\rho\cos\varphi
\]

\[
dV=\rho^2\sin\varphi\,d\rho\,d\varphi\,d\theta
\]`, ["高数", "三重积分", "柱坐标", "球坐标"]);

  add("math-v3-multiple-integrals", "jacobian-symmetry", "变量代换、对称性与质心", "换元先算 Jacobian；积分域与被积函数同时看对称性。", String.raw`### 一般变量代换

\[
\iint_D f(x,y)dxdy=\iint_{D'}f(x(u,v),y(u,v))\left|\frac{\partial(x,y)}{\partial(u,v)}\right|dudv
\]

### 质量与质心

\[
M=\iint_D\rho(x,y)d\sigma
\]

\[
\bar x=\frac1M\iint_D x\rho\,d\sigma,\qquad
\bar y=\frac1M\iint_D y\rho\,d\sigma
\]`, ["高数", "重积分", "变量代换", "对称性", "质心"]);

  add("math-v3-curves-surfaces", "line-integrals", "两类曲线积分", "第一类与方向无关；第二类必须跟随曲线方向。", String.raw`### 第一类曲线积分

\[
\int_L f(x,y)ds=\int_\alpha^\beta f(x(t),y(t))\sqrt{x'^2(t)+y'^2(t)}\,dt
\]

### 第二类曲线积分

\[
\int_L Pdx+Qdy=\int_\alpha^\beta[P(x(t),y(t))x'(t)+Q(x(t),y(t))y'(t)]dt
\]`, ["高数", "曲线积分", "第一类", "第二类"]);

  add("math-v3-curves-surfaces", "green-path", "Green 公式与路径无关", "闭合平面曲线先检查 Green；路径无关先验偏导交叉相等。", String.raw`### Green 公式（正向闭曲线）

\[
\oint_L Pdx+Qdy=\iint_D\left(\frac{\partial Q}{\partial x}-\frac{\partial P}{\partial y}\right)dxdy
\]

### 路径无关

在单连通区域内：

\[
P_y=Q_x\Longleftrightarrow \int_LPdx+Qdy\text{ 与路径无关}
\]

若 \(du=Pdx+Qdy\)，则积分等于 \(u(B)-u(A)\)。`, ["高数", "Green公式", "路径无关", "全微分"]);

  add("math-v3-curves-surfaces", "surface-gauss-stokes", "曲面积分、Gauss 与 Stokes", "封闭曲面优先 Gauss；有边界的定向曲面优先 Stokes。", String.raw`### 第一类曲面积分

若 \(z=z(x,y)\)，则

\[
\iint_\Sigma f\,dS=\iint_D f(x,y,z)\sqrt{1+z_x^2+z_y^2}\,dxdy
\]

### Gauss 公式（外侧）

\[
\iint_\Sigma P\,dydz+Q\,dzdx+R\,dxdy
=\iiint_\Omega(P_x+Q_y+R_z)dV
\]

### Stokes 公式

\[
\oint_{\partial\Sigma}\boldsymbol F\cdot d\boldsymbol r
=\iint_\Sigma(\nabla\times\boldsymbol F)\cdot\boldsymbol n\,dS
\]`, ["高数", "曲面积分", "Gauss", "Stokes"]);

  add("math-v3-differential-equations", "first-order-separable", "可分离与齐次一阶方程", "能把 \(x\)、\(y\) 分到两边就分离；出现 \(y/x\) 就令 \(u=y/x\)。", String.raw`### 可分离变量

\[
\frac{dy}{dx}=f(x)g(y)\Rightarrow \int\frac{dy}{g(y)}=\int f(x)dx+C
\]

### 齐次方程

\[
y'=F\left(\frac yx\right),\quad y=ux\Rightarrow y'=u+xu'
\]`, ["高数", "微分方程", "可分离", "齐次"]);

  add("math-v3-differential-equations", "linear-bernoulli", "一阶线性与 Bernoulli 方程", "一阶线性直接套积分因子；Bernoulli 用 \(z=y^{1-n}\) 化线性。", String.raw`### 一阶线性方程

\[
y'+P(x)y=Q(x)
\]

\[
y=e^{-\int Pdx}\left(\int Qe^{\int Pdx}dx+C\right)
\]

### Bernoulli 方程

\[
y'+P(x)y=Q(x)y^n,\quad z=y^{1-n}
\]

\[
z'+(1-n)Pz=(1-n)Q
\]`, ["高数", "微分方程", "一阶线性", "Bernoulli"]);

  add("math-v3-differential-equations", "constant-coefficient", "常系数线性微分方程", "先写特征方程；根的类型决定齐次解形状。", String.raw`对

\[
y''+py'+qy=0
\]

特征方程：\(r^2+pr+q=0\)。

- 不同实根 \(r_1,r_2\)：\(y=C_1e^{r_1x}+C_2e^{r_2x}\)
- 二重根 \(r\)：\(y=(C_1+C_2x)e^{rx}\)
- 共轭复根 \(\alpha\pm i\beta\)：

\[
y=e^{\alpha x}(C_1\cos\beta x+C_2\sin\beta x)
\]`, ["高数", "微分方程", "常系数", "特征方程"]);

  add("math-v3-differential-equations", "particular-euler", "非齐次特解与 Euler 方程", "特解形式跟随右端；与特征根重合时乘足够次数的 \(x\)。", String.raw`### 待定系数原则

若右端为 \(e^{\lambda x}P_m(x)\)，设

\[
y^*=x^k e^{\lambda x}Q_m(x)
\]

其中 \(k\) 是 \(\lambda\) 作为特征根的重数。

### Euler 方程

\[
x^2y''+pxy'+qy=f(x)
\]

令 \(x=e^t\)，则

\[
xy'=\frac{dy}{dt},\qquad x^2y''=\frac{d^2y}{dt^2}-\frac{dy}{dt}
\]`, ["高数", "微分方程", "非齐次", "Euler方程"]);

  add("math-v3-series", "numeric-series", "数项级数判敛", "正项级数先比较、比值或根值；先检查通项是否趋于 0。", String.raw`必要条件：

\[
\sum u_n\text{ 收敛}\Rightarrow u_n\to0
\]

### \(p\) 级数

\[
\sum_{n=1}^{\infty}\frac1{n^p}\text{ 收敛}\Longleftrightarrow p>1
\]

### 比值与根值判别

\[
\lim\left|\frac{u_{n+1}}{u_n}\right|=\rho
\quad\text{或}\quad
\lim\sqrt[n]{|u_n|}=\rho
\]

\(\rho<1\) 绝对收敛，\(\rho>1\) 发散。`, ["高数", "级数", "判敛", "p级数"]);

  add("math-v3-series", "alternating-power", "交错级数与幂级数", "交错级数核对单调趋零；幂级数先求收敛半径再查端点。", String.raw`### Leibniz 判别

\[
u_n\downarrow0\Rightarrow\sum_{n=1}^{\infty}(-1)^{n-1}u_n\text{ 收敛}
\]

### 幂级数

\[
\sum_{n=0}^{\infty}a_n(x-x_0)^n
\]

若极限存在：

\[
R=\lim_{n\to\infty}\left|\frac{a_n}{a_{n+1}}\right|
\quad\text{或}\quad
R=\frac1{\lim\sqrt[n]{|a_n|}}
\]

收敛区间端点必须单独判断。`, ["高数", "交错级数", "幂级数", "收敛半径"]);

  add("math-v3-series", "fourier", "Fourier 级数", "先看奇偶性减少系数；端点取左右极限平均。", String.raw`周期为 \(2l\) 的 Fourier 级数：

\[
f(x)\sim\frac{a_0}{2}+\sum_{n=1}^{\infty}\left(a_n\cos\frac{n\pi x}{l}+b_n\sin\frac{n\pi x}{l}\right)
\]

\[
a_n=\frac1l\int_{-l}^{l}f(x)\cos\frac{n\pi x}{l}dx,\qquad
b_n=\frac1l\int_{-l}^{l}f(x)\sin\frac{n\pi x}{l}dx
\]

间断点处收敛到

\[
\frac{f(x^-)+f(x^+)}2.
\]`, ["高数", "Fourier级数", "周期", "奇偶性"]);

  add("math-v3-space-geometry", "vector-algebra", "向量代数", "垂直看点积，平行看叉积，体积看混合积。", String.raw`\[
\boldsymbol a\cdot\boldsymbol b=|\boldsymbol a||\boldsymbol b|\cos\theta
\]

\[
|\boldsymbol a\times\boldsymbol b|=|\boldsymbol a||\boldsymbol b|\sin\theta
\]

\[
[\boldsymbol a,\boldsymbol b,\boldsymbol c]=(\boldsymbol a\times\boldsymbol b)\cdot\boldsymbol c
\]

\[
\boldsymbol a\perp\boldsymbol b\Longleftrightarrow\boldsymbol a\cdot\boldsymbol b=0,qquad
\boldsymbol a\parallel\boldsymbol b\Longleftrightarrow\boldsymbol a\times\boldsymbol b=\boldsymbol0
\]`, ["高数", "空间解析几何", "向量", "点积", "叉积"]);

  add("math-v3-space-geometry", "planes-lines", "平面、直线、距离与夹角", "平面抓法向量，直线抓方向向量。", String.raw`### 平面

\[
Ax+By+Cz+D=0,\qquad \boldsymbol n=(A,B,C)
\]

### 空间直线

\[
\frac{x-x_0}{l}=\frac{y-y_0}{m}=\frac{z-z_0}{n},\qquad \boldsymbol s=(l,m,n)
\]

### 点到平面距离

\[
d=\frac{|Ax_0+By_0+Cz_0+D|}{\sqrt{A^2+B^2+C^2}}
\]

### 夹角

\[
\cos\theta_{\text{两平面}}=\frac{|\boldsymbol n_1\cdot\boldsymbol n_2|}{|\boldsymbol n_1||\boldsymbol n_2|},\qquad
\sin\theta_{\text{线面}}=\frac{|\boldsymbol s\cdot\boldsymbol n|}{|\boldsymbol s||\boldsymbol n|}
\]`, ["高数", "空间解析几何", "平面", "直线", "距离", "夹角"]);

  add("math-v3-determinants-matrices", "determinants", "行列式常用公式", "行列式先看三角形、交换、倍乘与加行列变换。", String.raw`\[
|A^T|=|A|,\qquad |AB|=|A||B|,\qquad |A^{-1}|=\frac1{|A|}
\]

\[
|kA|=k^n|A|\quad(A\text{ 为 }n\text{ 阶})
\]

### Laplace 展开

\[
|A|=\sum_{j=1}^{n}a_{ij}A_{ij}=\sum_{i=1}^{n}a_{ij}A_{ij}
\]

交换两行（列）变号；某行（列）乘 \(k\)，行列式乘 \(k\)；一行（列）的倍数加到另一行（列），值不变。`, ["线性代数", "行列式", "Laplace"]);

  add("math-v3-determinants-matrices", "inverse-adjugate", "逆矩阵与伴随矩阵", "先判行列式非零；二阶或含参矩阵常用伴随公式。", String.raw`\[
A^{-1}=\frac1{|A|}A^*,\qquad |A|\ne0
\]

\[
AA^*=A^*A=|A|E
\]

\[
(AB)^{-1}=B^{-1}A^{-1},\quad (A^T)^{-1}=(A^{-1})^T,\quad (kA)^{-1}=\frac1kA^{-1}
\]

对 \(n\) 阶可逆矩阵：

\[
|A^*|=|A|^{n-1},\qquad (A^*)^{-1}=\frac1{|A|}A
\]`, ["线性代数", "逆矩阵", "伴随矩阵"]);

  add("math-v3-determinants-matrices", "rank-identities", "矩阵秩与常用恒等式", "秩题先用初等变换；乘积秩不超过任一因子。", String.raw`\[
r(A)=r(A^T)=r(PAQ)\quad(P,Q\text{ 可逆})
\]

\[
r(A+B)\le r(A)+r(B),\qquad r(AB)\le\min\{r(A),r(B)\}
\]

\[
r(A)+r(B)-n\le r(AB)
\]

若 \(AB=0\)，则

\[
r(A)+r(B)\le n.
\]

\[
r(A)=n\Longleftrightarrow |A|\ne0\Longleftrightarrow A\text{ 可逆}
\]`, ["线性代数", "矩阵秩", "秩不等式"]);

  add("math-v3-vectors-equations", "vector-rank", "向量组与线性相关", "把向量作列组成矩阵，用秩统一判断相关性与极大无关组。", String.raw`向量组 \(\alpha_1,\ldots,\alpha_s\) 线性无关：

\[
k_1\alpha_1+\cdots+k_s\alpha_s=0\Rightarrow k_1=\cdots=k_s=0
\]

\[
r(\alpha_1,\ldots,\alpha_s)=s\Longleftrightarrow\text{线性无关}
\]

若 \(\beta_1,\ldots,\beta_t\) 可由 \(\alpha_1,\ldots,\alpha_s\) 表示，则

\[
r(\beta_1,\ldots,\beta_t)\le r(\alpha_1,\ldots,\alpha_s).
\]`, ["线性代数", "向量组", "线性相关", "秩"]);

  add("math-v3-vectors-equations", "homogeneous-system", "齐次线性方程组", "未知数个数减系数矩阵秩，就是基础解系所含向量个数。", String.raw`对 \(Ax=0\)，设 \(A\) 为 \(m\times n\) 矩阵：

\[
Ax=0\text{ 有非零解}\Longleftrightarrow r(A)<n
\]

基础解系含有

\[
n-r(A)
\]

个线性无关解向量。通解为

\[
x=k_1\xi_1+\cdots+k_{n-r(A)}\xi_{n-r(A)}.
\]`, ["线性代数", "齐次方程组", "基础解系"]);

  add("math-v3-vectors-equations", "nonhomogeneous-system", "非齐次线性方程组", "比较系数矩阵与增广矩阵的秩；通解等于特解加齐次通解。", String.raw`\[
Ax=b\text{ 有解}\Longleftrightarrow r(A)=r(A,b)
\]

\[
r(A)=r(A,b)=n\Rightarrow\text{唯一解}
\]

\[
r(A)=r(A,b)<n\Rightarrow\text{无穷多解}
\]

若 \(\eta^*\) 是一个特解，\(\xi\) 为对应齐次方程通解，则

\[
x=\eta^*+\xi.
\]`, ["线性代数", "非齐次方程组", "增广矩阵", "通解"]);

  add("math-v3-eigen-quadratic", "eigenvalues", "特征值与特征向量", "先解特征方程，再解对应齐次方程；迹与行列式可快速校验。", String.raw`\[
|\lambda E-A|=0,\qquad (A-\lambda E)x=0
\]

若特征值为 \(\lambda_1,\ldots,\lambda_n\)，则

\[
\sum_{i=1}^{n}\lambda_i=\operatorname{tr}(A),\qquad
\prod_{i=1}^{n}\lambda_i=|A|
\]

\[
A^k\xi=\lambda^k\xi\quad(A\xi=\lambda\xi)
\]

相似矩阵有相同的特征多项式、特征值、迹、行列式与秩。`, ["线性代数", "特征值", "特征向量", "迹"]);

  add("math-v3-eigen-quadratic", "diagonalization", "相似对角化与实对称矩阵", "有 \(n\) 个线性无关特征向量才可对角化；实对称矩阵必可正交对角化。", String.raw`\[
P^{-1}AP=\Lambda=\operatorname{diag}(\lambda_1,\ldots,\lambda_n)
\]

\[
A=P\Lambda P^{-1}\Rightarrow A^k=P\Lambda^kP^{-1}
\]

若 \(A=A^T\)，存在正交矩阵 \(Q\)：

\[
Q^TAQ=\Lambda,\qquad Q^{-1}=Q^T
\]

实对称矩阵不同特征值对应的特征向量正交。`, ["线性代数", "相似对角化", "实对称矩阵", "正交矩阵"]);

  add("math-v3-eigen-quadratic", "quadratic-form", "二次型与正定判别", "二次型先写对称矩阵；正定常用特征值或顺序主子式。", String.raw`\[
f(x)=x^TAx,qquad A=A^T
\]

正交变换 \(x=Qy\)：

\[
f=y^T(Q^TAQ)y=\lambda_1y_1^2+\cdots+\lambda_ny_n^2
\]

正定等价条件：

\[
x^TAx>0\ (x\ne0)
\Longleftrightarrow \lambda_i>0\ (\forall i)
\Longleftrightarrow \Delta_k>0\ (k=1,\ldots,n)
\]

其中 \(\Delta_k\) 为各阶顺序主子式。`, ["线性代数", "二次型", "正定", "顺序主子式"]);

  add("math-v3-probability", "event-formulas", "事件运算与加法公式", "“至少一个”优先用对立事件；多个事件并集用容斥。", String.raw`\[
P(\overline A)=1-P(A)
\]

\[
P(A\cup B)=P(A)+P(B)-P(AB)
\]

\[
P(A\cup B\cup C)=P(A)+P(B)+P(C)-P(AB)-P(AC)-P(BC)+P(ABC)
\]

若 \(A\subset B\)，则

\[
P(B-A)=P(B)-P(A).
\]`, ["概率论", "事件", "加法公式", "容斥"]);

  add("math-v3-probability", "conditional-bayes", "条件概率、全概率与 Bayes", "按原因分组用全概率；已知结果反推原因用 Bayes。", String.raw`\[
P(A|B)=\frac{P(AB)}{P(B)},\qquad P(AB)=P(B)P(A|B)
\]

若 \(B_1,\ldots,B_n\) 构成完备事件组，则

\[
P(A)=\sum_{i=1}^{n}P(B_i)P(A|B_i)
\]

\[
P(B_k|A)=\frac{P(B_k)P(A|B_k)}{\sum_{i=1}^{n}P(B_i)P(A|B_i)}
\]`, ["概率论", "条件概率", "全概率", "Bayes"]);

  add("math-v3-probability", "independence-bernoulli", "独立性与 Bernoulli 试验", "独立不是互斥；独立事件的交概率等于概率乘积。", String.raw`\[
A,B\text{ 独立}\Longleftrightarrow P(AB)=P(A)P(B)
\]

\(n\) 重 Bernoulli 试验中事件 \(A\) 恰好发生 \(k\) 次：

\[
P_n(k)=\binom nk p^k(1-p)^{n-k}
\]

至少发生一次：

\[
1-(1-p)^n.
\]`, ["概率论", "独立性", "Bernoulli试验"]);

  add("math-v3-distributions", "cdf-density", "分布函数与概率密度", "区间概率统一写成分布函数之差；连续型概率看密度积分。", String.raw`### 分布函数

\[
F_X(x)=P(X\le x),\qquad P(a<X\le b)=F_X(b)-F_X(a)
\]

### 连续型随机变量

\[
F_X(x)=\int_{-\infty}^{x}f_X(t)dt,\qquad f_X(x)=F_X'(x)
\]

\[
f_X(x)\ge0,\qquad \int_{-\infty}^{\infty}f_X(x)dx=1
\]`, ["概率论", "随机变量", "分布函数", "密度"]);

  add("math-v3-distributions", "discrete-distributions", "常见离散分布", "先认取值集合，再记概率、期望与方差。", String.raw`### 0-1 分布 \(B(1,p)\)

\[
P(X=1)=p,\quad E(X)=p,\quad D(X)=p(1-p)
\]

### 二项分布 \(B(n,p)\)

\[
P(X=k)=\binom nkp^k(1-p)^{n-k},\quad E(X)=np,\quad D(X)=np(1-p)
\]

### Poisson 分布 \(P(\lambda)\)

\[
P(X=k)=e^{-\lambda}\frac{\lambda^k}{k!},\quad E(X)=D(X)=\lambda
\]

### 几何分布

\[
P(X=k)=(1-p)^{k-1}p,\quad E(X)=\frac1p,\quad D(X)=\frac{1-p}{p^2}
\]`, ["概率论", "离散分布", "二项分布", "Poisson", "几何分布"]);

  add("math-v3-distributions", "continuous-distributions", "常见连续分布", "均匀看区间长度，指数看无记忆性，正态先标准化。", String.raw`### 均匀分布 \(U(a,b)\)

\[
f(x)=\frac1{b-a},\quad E(X)=\frac{a+b}{2},\quad D(X)=\frac{(b-a)^2}{12}
\]

### 指数分布 \(E(\lambda)\)

\[
f(x)=\lambda e^{-\lambda x}\ (x>0),\quad E(X)=\frac1\lambda,\quad D(X)=\frac1{\lambda^2}
\]

### 正态分布 \(N(\mu,\sigma^2)\)

\[
f(x)=\frac1{\sqrt{2\pi}\sigma}e^{-\frac{(x-\mu)^2}{2\sigma^2}},\qquad
Z=\frac{X-\mu}{\sigma}\sim N(0,1)
\]

\[
\Phi(-x)=1-\Phi(x)
\]`, ["概率论", "连续分布", "均匀分布", "指数分布", "正态分布"]);

  add("math-v3-random-vectors", "joint-marginal", "联合、边缘与条件分布", "由联合求边缘就是对另一个变量求和或积分。", String.raw`### 离散型边缘分布

\[
p_X(x_i)=\sum_j p_{ij},\qquad p_Y(y_j)=\sum_i p_{ij}
\]

### 连续型边缘密度

\[
f_X(x)=\int_{-\infty}^{\infty}f(x,y)dy,\qquad
f_Y(y)=\int_{-\infty}^{\infty}f(x,y)dx
\]

### 条件密度

\[
f_{X|Y}(x|y)=\frac{f(x,y)}{f_Y(y)}
\]`, ["概率论", "联合分布", "边缘分布", "条件分布"]);

  add("math-v3-random-vectors", "independence-normal", "随机变量独立与二维正态", "联合密度能分解成边缘密度乘积才独立；二维正态中不相关等价于独立。", String.raw`\[
X,Y\text{ 独立}\Longleftrightarrow F(x,y)=F_X(x)F_Y(y)
\]

连续型时：

\[
f(x,y)=f_X(x)f_Y(y)
\]

若 \((X,Y)\) 服从二维正态分布，则

\[
X,Y\text{ 独立}\Longleftrightarrow \rho=0.
\]

独立正态变量的线性组合仍服从正态分布。`, ["概率论", "独立性", "二维正态", "相关系数"]);

  add("math-v3-random-vectors", "functions-convolution", "随机变量函数、卷积与最值", "和的分布用卷积；最大最小值先写分布函数。", String.raw`### 和的卷积

若 \(X,Y\) 独立，则 \(Z=X+Y\) 的密度为

\[
f_Z(z)=\int_{-\infty}^{\infty}f_X(x)f_Y(z-x)dx
\]

### 最大值与最小值（独立同分布）

\[
F_{\max}(x)=[F(x)]^n
\]

\[
F_{\min}(x)=1-[1-F(x)]^n
\]

### 单调变换 \(Y=g(X)\)

\[
f_Y(y)=f_X(g^{-1}(y))\left|\frac{d}{dy}g^{-1}(y)\right|
\]`, ["概率论", "卷积", "最大值", "最小值", "函数分布"]);

  add("math-v3-moments-limits", "expectation-variance", "期望与方差", "期望可直接对函数取平均；方差优先用平方期望减期望平方。", String.raw`\[
E[g(X)]=\sum g(x_i)p_i\quad\text{或}\quad E[g(X)]=\int_{-\infty}^{\infty}g(x)f(x)dx
\]

\[
D(X)=E[(X-E X)^2]=E(X^2)-[E(X)]^2
\]

\[
E(aX+b)=aE(X)+b,\qquad D(aX+b)=a^2D(X)
\]

若 \(X,Y\) 独立：

\[
E(XY)=E(X)E(Y),\qquad D(X+Y)=D(X)+D(Y)
\]`, ["概率论", "期望", "方差", "矩"]);

  add("math-v3-moments-limits", "covariance-correlation", "协方差与相关系数", "协方差衡量线性同向变化；相关系数是标准化协方差。", String.raw`\[
\operatorname{Cov}(X,Y)=E(XY)-E(X)E(Y)
\]

\[
\rho_{XY}=\frac{\operatorname{Cov}(X,Y)}{\sqrt{D(X)D(Y)}},\qquad |\rho_{XY}|\le1
\]

\[
D(X\pm Y)=D(X)+D(Y)\pm2\operatorname{Cov}(X,Y)
\]

独立 \(\Rightarrow\) 不相关；反向一般不成立。`, ["概率论", "协方差", "相关系数", "不相关"]);

  add("math-v3-moments-limits", "inequalities-limit-theorems", "概率不等式、大数定律与中心极限定理", "估尾概率用 Markov/Chebyshev；样本和近似正态用中心极限定理。", String.raw`### Markov 不等式

\[
X\ge0\Rightarrow P(X\ge a)\le\frac{E(X)}a
\]

### Chebyshev 不等式

\[
P(|X-E X|\ge\varepsilon)\le\frac{D(X)}{\varepsilon^2}
\]

### 独立同分布中心极限定理

若 \(E(X_i)=\mu,D(X_i)=\sigma^2\)，则

\[
\frac{\sum_{i=1}^{n}X_i-n\mu}{\sigma\sqrt n}\xrightarrow{d}N(0,1)
\]

### Bernoulli 中心极限定理

\[
\frac{X-np}{\sqrt{np(1-p)}}\approx N(0,1),\qquad X\sim B(n,p)
\]`, ["概率论", "Markov", "Chebyshev", "大数定律", "中心极限定理"]);

  add("math-v3-statistics", "sample-distributions", "样本统计量与三大抽样分布", "正态总体题先识别 \(\chi^2\)、\(t\)、\(F\) 枢轴量。", String.raw`\[
\bar X=\frac1n\sum_{i=1}^{n}X_i,\qquad
S^2=\frac1{n-1}\sum_{i=1}^{n}(X_i-\bar X)^2
\]

若总体 \(N(\mu,\sigma^2)\)，则

\[
\bar X\sim N\left(\mu,\frac{\sigma^2}{n}\right)
\]

\[
\frac{(n-1)S^2}{\sigma^2}\sim\chi^2(n-1),\qquad
\frac{\bar X-\mu}{S/\sqrt n}\sim t(n-1)
\]

两个独立卡方变量之比：

\[
\frac{U/n_1}{V/n_2}\sim F(n_1,n_2).
\]`, ["数理统计", "样本均值", "样本方差", "卡方分布", "t分布", "F分布"]);

  add("math-v3-statistics", "estimation", "矩估计与最大似然估计", "矩估计令样本矩等于总体矩；似然估计先取对数再求极值。", String.raw`### 矩估计

\[
\frac1n\sum_{i=1}^{n}X_i^k=E_\theta(X^k)
\]

### 似然函数

离散型：

\[
L(\theta)=\prod_{i=1}^{n}P_\theta(X=x_i)
\]

连续型：

\[
L(\theta)=\prod_{i=1}^{n}f(x_i;\theta)
\]

最大似然估计通常解

\[
\frac{d}{d\theta}\ln L(\theta)=0.
\]`, ["数理统计", "矩估计", "最大似然估计", "似然函数"]);

  add("math-v3-statistics", "confidence-tests", "正态总体区间估计与检验统计量", "先看方差是否已知，再选 \(Z\)、\(t\) 或 \(\chi^2\) 枢轴量。", String.raw`### 均值区间（\(\sigma\) 已知）

\[
\bar X\pm z_{\alpha/2}\frac{\sigma}{\sqrt n}
\]

### 均值区间（\(\sigma\) 未知）

\[
\bar X\pm t_{\alpha/2}(n-1)\frac{S}{\sqrt n}
\]

### 方差区间

\[
\left(\frac{(n-1)S^2}{\chi^2_{1-\alpha/2}(n-1)},
\frac{(n-1)S^2}{\chi^2_{\alpha/2}(n-1)}\right)
\]

这里 \(\chi^2_p(\nu)\) 表示自由度为 \(\nu\) 的卡方分布的 \(p\) 分位点。

常用检验统计量：

\[
Z=\frac{\bar X-\mu_0}{\sigma/\sqrt n},\qquad
T=\frac{\bar X-\mu_0}{S/\sqrt n}.
\]`, ["数理统计", "区间估计", "假设检验", "置信区间"]);

  return { VERSION, SECTIONS, CARDS };
});
