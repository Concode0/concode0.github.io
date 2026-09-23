export type Project = {
  title: string;
  description?: string;
  techs: string[];
  link: string;
};

export const projects: Project[] = [
  {
    title: "Clifra",
    description:
      "A differentiable Clifford algebra computation layer for PyTorch, built around semantic layouts and reusable planned execution.",
    techs: ["Python", "PyTorch", "Clifford Algebra"],
    link: "https://github.com/Concode0/clifra",
  },
  {
    title: "Clifra Model Bench",
    description:
      "Matched reference and Clifra-native implementations of geometric deep learning models, with correctness and performance comparisons across CPU, MPS, and CUDA.",
    techs: ["PyTorch", "Benchmarking", "Geometric ML"],
    link: "https://github.com/Concode0/clifra-model-bench",
  },
  {
    title: "Basin",
    description:
      "A deterministic sandbox for decentralized load balancing, exploring how heterogeneous nodes distribute work through local decisions and delayed gossip.",
    techs: ["Python", "Distributed Systems", "Simulation"],
    link: "https://github.com/Concode0/basin",
  },
];

export const openSourceWork: Project[] = [
  {
    title: "Kingdon",
    description:
      "Fixed handling of out-of-range basis blades in MultiVector construction. A larger semantic blade-key refactor is currently under review.",
    techs: ["Python", "Geometric Algebra", "Merged Upstream"],
    link: "https://github.com/tBuLi/kingdon/pull/148",
  },
  {
    title: "espp",
    description:
      "Contributed BMI270 calibration support and several ESP32-C3 compatibility fixes, including interrupt, I2C, and initialization paths.",
    techs: ["C++", "ESP32-C3", "BMI270", "Merged Upstream"],
    link: "https://github.com/esp-cpp/espp/pull/595",
  },
  {
    title: "PyTorch",
    description:
      "Fixed an incorrect T8 coefficient in torch.linalg.matrix_exp and added focused forward and backward regression tests.",
    techs: ["C++", "PyTorch", "Numerical Computing", "Merged Upstream"],
    link: "https://github.com/pytorch/pytorch/pull/196658",
  },
];