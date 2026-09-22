export type Project = {
  title: string;
  techs: string[];
  link: string;
  isComingSoon?: boolean;
};

const projects: Project[] = [
  {
    title: "Clifra",
    techs: ["Python", "PyTorch", "Clifford Algebra"],
    link: "https://github.com/Concode0/clifra",
  },
  {
    title: "Clifra Model Bench",
    techs: ["PyTorch", "Geometric Deep Learning", "Benchmarking"],
    link: "https://github.com/Concode0/clifra-model-bench",
  }
];


export default projects;
