# RNA-seq Analysis Pipeline

## Overview
This guide describes the complete RNA-seq analysis pipeline from raw sequencing data to differential expression analysis.

## Software Requirements

### Core Tools
- **FastQC** (v0.11.9): Quality control of raw sequencing reads
- **Trimmomatic** (v0.39): Adapter trimming and quality filtering
- **STAR** (v2.7.9a): RNA-seq read alignment to reference genome
- **HTSeq** (v2.0.2): Read counting for gene expression quantification
- **DESeq2** (v1.34.0): Differential expression analysis

### Installation Commands
```bash
# Install FastQC
conda install -c bioconda fastqc

# Install Trimmomatic
conda install -c bioconda trimmomatic

# Install STAR
conda install -c bioconda star

# Install HTSeq
pip install HTSeq

# Install DESeq2 (R package)
if (!require("BiocManager", quietly = TRUE))
    install.packages("BiocManager")
BiocManager::install("DESeq2")
```

## Pipeline Steps

### 1. Quality Control
```bash
fastqc raw_reads_R1.fastq.gz raw_reads_R2.fastq.gz
```

### 2. Adapter Trimming
```bash
trimmomatic PE -threads 8 \
  raw_reads_R1.fastq.gz raw_reads_R2.fastq.gz \
  trimmed_R1.fastq.gz trimmed_R1_unpaired.fastq.gz \
  trimmed_R2.fastq.gz trimmed_R2_unpaired.fastq.gz \
  ILLUMINACLIP:TruSeq3-PE.fa:2:30:10 \
  LEADING:3 TRAILING:3 SLIDINGWINDOW:4:15 MINLEN:36
```

### 3. Genome Alignment
```bash
STAR --runMode alignReads \
  --genomeDir /path/to/genome_index \
  --readFilesIn trimmed_R1.fastq.gz trimmed_R2.fastq.gz \
  --readFilesCommand zcat \
  --outSAMtype BAM SortedByCoordinate \
  --outFileNamePrefix aligned_
```

### 4. Read Counting
```bash
htseq-count -f bam -r pos -s no \
  aligned_Aligned.sortedByCoord.out.bam \
  /path/to/annotations.gtf > counts.txt
```

### 5. Differential Expression Analysis
```r
library(DESeq2)

# Load count data
countData <- read.table("counts.txt", header=TRUE, row.names=1)
colData <- read.table("sample_info.txt", header=TRUE, row.names=1)

# Create DESeq2 object
dds <- DESeqDataSetFromMatrix(countData = countData,
                              colData = colData,
                              design = ~ condition)

# Run differential expression analysis
dds <- DESeq(dds)
results <- results(dds)
```

## Expected Outputs

### Quality Control
- FastQC HTML reports showing read quality metrics
- Trimmomatic trimming statistics

### Alignment
- BAM files with aligned reads
- STAR alignment statistics

### Expression Analysis
- Count matrix with gene expression values
- DESeq2 results with fold changes and p-values
- Volcano plots and MA plots

## Troubleshooting

### Common Issues
1. **Low alignment rate**: Check reference genome version and annotation
2. **High adapter contamination**: Verify adapter sequences in Trimmomatic
3. **Memory issues**: Increase available RAM for STAR alignment
4. **No significant genes**: Check sample grouping and statistical parameters

### Performance Optimization
- Use multiple CPU cores for parallel processing
- Allocate sufficient memory (32GB+ recommended)
- Use SSD storage for temporary files
- Consider cloud computing for large datasets

## References
- Andrews, S. (2010). FastQC: a quality control tool for high throughput sequence data.
- Bolger, A. M., et al. (2014). Trimmomatic: a flexible trimmer for Illumina sequence data.
- Dobin, A., et al. (2013). STAR: ultrafast universal RNA-seq aligner.
- Love, M. I., et al. (2014). Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2.
