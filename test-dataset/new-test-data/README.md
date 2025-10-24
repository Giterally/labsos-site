# Drug Discovery ML Pipeline - Test Dataset

This directory contains test files for building a machine learning pipeline for drug discovery. The dataset includes various file types that would be typical for a research project involving molecular data analysis and predictive modeling.

## File Structure

```
new-test-data/
├── 01-project-overview.md          # Project overview and objectives
├── 02-data-preprocessing.py        # Python script for data preprocessing
├── 03-model-training.py            # Machine learning model training pipeline
├── 04-validation-protocol.txt      # Validation procedures and criteria
├── 05-results-analysis.R           # R script for statistical analysis
├── 06-deployment-guide.md          # Production deployment instructions
├── 07-experimental-data.csv        # Sample experimental data
├── 08-project-timeline.txt         # Project timeline and milestones
└── README.md                       # This file
```

## File Descriptions

### 01-project-overview.md
- Project overview and objectives
- Expected outcomes and timeline
- Resource requirements
- Success metrics

### 02-data-preprocessing.py
- Python script for molecular data preprocessing
- SMILES validation and descriptor calculation
- Feature normalization and cleaning
- Example usage and testing

### 03-model-training.py
- Machine learning model training pipeline
- Multiple algorithms (RF, SVM, NN, GB)
- Cross-validation and performance evaluation
- Model comparison and selection

### 04-validation-protocol.txt
- Comprehensive validation procedures
- Performance metrics and acceptance criteria
- Statistical and biological validation
- Risk mitigation strategies

### 05-results-analysis.R
- R script for statistical analysis
- Performance visualization
- Feature importance analysis
- ROC curve generation

### 06-deployment-guide.md
- Production deployment instructions
- Configuration and monitoring
- Security considerations
- Troubleshooting guide

### 07-experimental-data.csv
- Sample experimental data with 50 compounds
- Molecular descriptors and activity data
- SMILES strings and IC50 values
- Binary activity classification

### 08-project-timeline.txt
- Detailed project timeline
- Phase-wise deliverables
- Risk mitigation strategies
- Success metrics

## Usage Instructions

1. **Upload to LabsOS**: Use the import functionality to upload these files
2. **Generate Proposals**: The AI will analyze the content and generate node proposals
3. **Build Tree**: Select proposals and build an experiment tree
4. **Review Results**: Check that links and attachments are properly transferred

## Expected Outcomes

When uploaded to LabsOS, this dataset should generate:

- **Project Overview Node**: High-level project description
- **Data Processing Nodes**: Scripts and protocols for data handling
- **Model Development Nodes**: Training and validation procedures
- **Analysis Nodes**: Statistical analysis and visualization
- **Deployment Nodes**: Production deployment and monitoring
- **Documentation Nodes**: Timeline and validation protocols

## File Types Included

- **Markdown (.md)**: Documentation and guides
- **Python (.py)**: Data processing and ML scripts
- **R (.R)**: Statistical analysis scripts
- **CSV (.csv)**: Experimental data
- **Text (.txt)**: Protocols and timelines

## Dependencies

The scripts reference common scientific Python and R packages:

**Python:**
- pandas, numpy
- scikit-learn
- rdkit (for cheminformatics)
- joblib

**R:**
- ggplot2, dplyr
- corrplot, pROC
- caret, randomForest

## Notes

- This is a synthetic dataset for testing purposes
- SMILES strings and experimental data are examples
- Scripts are functional but may require dependency installation
- All files are designed to be realistic and comprehensive

## Testing the Fix

This dataset is particularly useful for testing the recent database schema fixes:

1. **Links**: The markdown files contain internal references that should become links
2. **Attachments**: The CSV and script files should be attached to relevant nodes
3. **Position**: Links and attachments should maintain proper ordering
4. **Transfer**: All content should transfer correctly from proposals to tree nodes

Upload this dataset and verify that:
- All 8 files are processed
- Links are created between related content
- Attachments are properly associated with nodes
- The tree structure reflects the project workflow
