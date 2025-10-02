import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ researcherId: string }> }
) {
  const { researcherId } = await params

  // Mock data for now - replace with Supabase queries
  const mockResearcher = {
    id: researcherId,
    name: "Dr. Sarah Chen",
    title: "Senior Research Scientist",
    email: "sarah.chen@stanford.edu",
    bio: "Dr. Sarah Chen is a leading researcher in synthetic biology and protein engineering. She has over 10 years of experience developing novel protein expression systems and has published extensively in top-tier journals. Her work focuses on creating sustainable biomanufacturing solutions for therapeutic proteins.",
    avatar: "SC",
    institution: "Stanford University",
    department: "Bioengineering",
    location: "Stanford, CA",
    website: "https://bioeng.stanford.edu/chen",
    linkedin: "https://linkedin.com/in/sarahchen",
    orcid: "0000-0000-0000-0000",
    joinedDate: "2020-03-15",
    lastActive: "2024-01-20",
    currentProjects: [
      {
        id: "proj-1",
        name: "Protein Expression Optimization",
        description: "Developing novel E. coli expression systems for therapeutic proteins",
        status: "active",
        role: "Principal Investigator",
        startDate: "2023-01-01",
        project: {
          id: "project-1",
          name: "Bioengineering Lab"
        }
      },
      {
        id: "proj-2",
        name: "Cell-Free Protein Synthesis",
        description: "Exploring cell-free systems for rapid protein prototyping",
        status: "active",
        role: "Co-Investigator",
        startDate: "2023-06-01",
        project: {
          id: "project-1",
          name: "Bioengineering Lab"
        }
      }
    ],
    pastProjects: [
      {
        id: "proj-3",
        name: "Yeast Expression Systems",
        description: "Optimizing Pichia pastoris for industrial protein production",
        status: "completed",
        role: "Principal Investigator",
        startDate: "2021-01-01",
        endDate: "2023-12-31",
        project: {
          id: "project-1",
          name: "Bioengineering Lab"
        }
      },
      {
        id: "proj-4",
        name: "Protein Folding Studies",
        description: "Understanding folding mechanisms in therapeutic proteins",
        status: "completed",
        role: "Co-Investigator",
        startDate: "2020-06-01",
        endDate: "2022-05-31",
        project: {
          id: "project-1",
          name: "Bioengineering Lab"
        }
      }
    ],
    publications: [
      {
        id: "pub-1",
        title: "Novel E. coli Expression Systems for Therapeutic Proteins",
        authors: ["Sarah Chen", "Michael Rodriguez", "Lisa Wang"],
        journal: "Nature Biotechnology",
        year: 2023,
        doi: "10.1038/s41587-023-01234-5",
        url: "https://nature.com/articles/s41587-023-01234-5"
      },
      {
        id: "pub-2",
        title: "Cell-Free Protein Synthesis: A Rapid Prototyping Platform",
        authors: ["Sarah Chen", "David Kim", "Emma Thompson"],
        journal: "ACS Synthetic Biology",
        year: 2023,
        doi: "10.1021/acssynbio.3c00123"
      },
      {
        id: "pub-3",
        title: "Optimizing Pichia pastoris for Industrial Protein Production",
        authors: ["Sarah Chen", "James Wilson", "Maria Garcia"],
        journal: "Biotechnology and Bioengineering",
        year: 2022,
        doi: "10.1002/bit.28045"
      }
    ],
    skills: [
      "Protein Engineering",
      "Synthetic Biology",
      "Molecular Biology",
      "Biochemistry",
      "Cell Culture",
      "Protein Purification",
      "Data Analysis",
      "Project Management"
    ],
    interests: [
      "Therapeutic Proteins",
      "Biomanufacturing",
      "Sustainability",
      "Open Science",
      "Mentoring"
    ],
    stats: {
      totalProjects: 4,
      activeProjects: 2,
      completedProjects: 2,
      publications: 3,
      collaborations: 8
    }
  }

  return NextResponse.json({ researcher: mockResearcher })
}
