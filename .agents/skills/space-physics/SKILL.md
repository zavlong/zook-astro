---
name: space-physics
description: >-
  Workspace-specific Generative Physics Ecosystem skill for astrophysics modeling,
  2D/3D orbital mechanics, Lagrange point explorers, Hohmann & gravity-assist slingshot
  trajectory simulations, planetary magnetospheres, and radiative-convective atmospheric
  greenhouse transfer labs. Activate whenever building or refining orbital mechanics,
  system map physics overlays, spacecraft trajectory calculators, or planetary
  atmospheric/interior models.
---

# Space Physics Workbench & Generative Physics Ecosystem

Operational protocols for building, extending, and visualizing physics-based space environments in Zook Astro.

---

## 1. Orbital Mechanics & Lagrange Point Explorer Protocols

### A. Gravitational Parameter & Vis-Viva Equation
For a central stellar mass $M_\star$ (in $M_\odot$) and radial distance $r$ (in AU):
- Standard gravitational parameter in $\text{AU}^3/\text{yr}^2$:
  $$\mu = 4\pi^2 M_\star$$
- Orbital velocity in $\text{km/s}$ ($1\text{ AU/yr} \approx 4.74057\text{ km/s}$, $v_\oplus \approx 29.78\text{ km/s}$):
  $$v(r, a) = 29.7847 \sqrt{M_\star \left(\frac{2}{r} - \frac{1}{a}\right)}$$

### B. Hill Sphere & Roche Limit
- **Hill Sphere Radius ($R_H$)**: Gravitational domain around a planet of mass $m_p$ ($M_\oplus$) orbiting star $M_\star$ ($M_\odot$):
  $$R_H = a(1 - e) \left(\frac{m_p}{3 M_\star \cdot 332946}\right)^{1/3}$$
- **Rigid/Fluid Roche Limit ($d_{\text{Roche}}$)**:
  $$d_{\text{Roche}} = 2.44 \, R_p \left(\frac{\rho_p}{\rho_m}\right)^{1/3}$$

### C. Five Lagrange Points ($L_1 - L_5$) in 3D Keplerian Coordinates
Given a planet at instantaneous orbital true longitude $\theta$ and heliocentric distance $r_p$:
1. **$L_1$ (Sub-Stellar Gateway)**: Located along the star-to-planet vector at $r_{L1} = r_p - R_H$.
2. **$L_2$ (Deep-Space Observatory Point)**: Located along the star-to-planet vector at $r_{L2} = r_p + R_H$.
3. **$L_3$ (Counter-Orbital Point)**: Located opposite the star at $\theta_{L3} = \theta + \pi$, distance $r_{L3} \approx a \left(1 + \frac{7}{12}\frac{m_p}{M_\star}\right)$.
4. **$L_4$ (Leading Trojan Point)**: Located $+60^\circ$ ahead on the planet's 3D inclined orbit ($\theta_{L4} = \theta + \frac{\pi}{3}$). Stable when $M_\star / m_p > 24.96$.
5. **$L_5$ (Trailing Trojan Point)**: Located $-60^\circ$ behind on the planet's 3D inclined orbit ($\theta_{L5} = \theta - \frac{\pi}{3}$).

---

## 2. Slingshot Maneuver & Interplanetary Transfer Models

### A. Hohmann Transfer Orbit ($r_1 \to r_2$)
- Transfer ellipse semi-major axis and eccentricity:
  $$a_{\text{trans}} = \frac{r_1 + r_2}{2}, \quad e_{\text{trans}} = \frac{|r_2 - r_1|}{r_1 + r_2}$$
- Departure and arrival velocity impulses ($\text{km/s}$):
  $$\Delta v_1 = 29.7847 \sqrt{\frac{M_\star}{r_1}} \left| \sqrt{\frac{2 r_2}{r_1 + r_2}} - 1 \right|$$
  $$\Delta v_2 = 29.7847 \sqrt{\frac{M_\star}{r_2}} \left| 1 - \sqrt{\frac{2 r_1}{r_1 + r_2}} \right|$$
- Transfer duration (half-period):
  $$t_{\text{trans}} = \frac{1}{2} \sqrt{\frac{a_{\text{trans}}^3}{M_\star}} \text{ years}$$

### B. Gravity-Assist Slingshot Mechanics
- Surface escape velocity of a planet ($M_p$ in $M_\oplus$, $R_p$ in $R_\oplus$):
  $$v_{\text{esc}} = 11.186 \sqrt{\frac{M_p}{R_p}} \text{ km/s}$$
- For a hyperbolic flyby with periapsis $r_p$ and hyperbolic excess speed $v_\infty$, the deflection turn angle $\delta$ is:
  $$\sin\left(\frac{\delta}{2}\right) = \frac{1}{1 + \frac{r_p v_\infty^2}{\mu_p}}$$
- Maximum theoretical heliocentric velocity kick at grazing periapsis ($r_p \approx R_p$, optimal $v_\infty = v_{\text{esc}}/\sqrt{2}$):
  $$\Delta v_{\text{slingshot, max}} = v_{\text{esc}} \text{ km/s}$$

---

## 3. Atmospheric Greenhouse Radiative Transfer Labs

### A. Equilibrium vs. Internal Heat Flux
- Planetary Bond albedo $A_B$ and incident stellar flux $S_{\text{eff}} = L_\star / a^2$:
  $$T_{\text{eq}} = 278.5 \, S_{\text{eff}}^{1/4} (1 - A_B)^{1/4}$$
- Radiative-convective top-of-atmosphere temperature including internal heat $T_{\text{int}}$:
  $$T_{\text{atm}} = \left(T_{\text{eq}}^4 + T_{\text{int}}^4\right)^{1/4}$$

### B. Multi-Gas Infrared Optical Depth & Greenhouse Transfer
- Gravity-scaled column mass factor: $g_{\text{fac}} = (1 / g)^{0.62}$.
- Effective gray infrared optical depth $\tau_{\text{IR}}$ derived from $\Delta T_{\text{GH}}$ under Eddington radiative equilibrium:
  $$T_{\text{surf}}^4 = T_{\text{atm}}^4 \left(1 + \frac{3}{4} \tau_{\text{IR}}\right) \implies \tau_{\text{IR}} = \frac{4}{3} \left[\left(\frac{T_{\text{surf}}}{T_{\text{atm}}}\right)^4 - 1\right]$$
- Dominant radiative contributors:
  1. $\text{CO}_2 / \text{CH}_4 / \text{NH}_3 / \text{SO}_2$ vibrational-rotational bands.
  2. $\text{H}_2\text{O}$ vapor foreign-broadened continuum ($8-12\,\mu\text{m}$ window closure).
  3. $\text{H}_2\text{-H}_2$ and $\text{N}_2\text{-N}_2$ Collision-Induced Absorption (CIA) scaling as $P^2 / g$.

---

## 4. UI & Visualization Standards
1. **Zero Debug Clutter**: Never display raw exponential notation (`7.00e-4`, `0.00e+0`) in UI cards. Use human-readable thresholds (`< 0.01 G`, `< 0.1 μT`).
2. **Concise Telemetry**: Avoid redundant sub-captions (e.g., never write "Relative to Earth" underneath $M_\oplus$). Keep physical impact descriptions to a single direct sentence.
3. **Interactive Canvas Overlays**: Render Lagrange points ($L_1-L_5$), Hill spheres, and Hohmann transfer arcs directly in the 3D/2D projection space (`project3D` / `evalKepler3D`).
