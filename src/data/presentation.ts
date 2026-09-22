type Social = {
  label: string;
  link: string;
};

type Presentation = {
  mail: string;
  title: string;
  description: string;
  socials: Social[];
  profile?: string;
};

const presentation: Presentation = {
  mail: "nemonanconcode0@gmail.com",
  title: "concode0",
  // profile: "/profile.webp",
  description:
      "I work on scientific computing, geometric algebra, machine learning systems, and open-source software.",
  socials: [
    {
      label: "Github",
      link: "https://github.com/Concode0",
    }
  ]
};

export default presentation;
