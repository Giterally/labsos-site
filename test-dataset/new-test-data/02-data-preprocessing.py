#!/usr/bin/env python3
"""
Data Preprocessing Pipeline for Drug Discovery ML Project

This script handles the preprocessing of molecular data including:
- SMILES string validation
- Molecular descriptor calculation
- Data cleaning and normalization
- Feature selection
"""

import pandas as pd
import numpy as np
from rdkit import Chem
from rdkit.Chem import Descriptors, rdMolDescriptors
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MolecularDataProcessor:
    """Class for processing molecular data for ML pipeline"""
    
    def __init__(self):
        self.descriptor_names = [
            'MolWt', 'LogP', 'NumHDonors', 'NumHAcceptors',
            'TPSA', 'NumRotatableBonds', 'NumAromaticRings'
        ]
    
    def validate_smiles(self, smiles_list):
        """Validate SMILES strings and return valid ones"""
        valid_smiles = []
        valid_indices = []
        
        for i, smiles in enumerate(smiles_list):
            mol = Chem.MolFromSmiles(smiles)
            if mol is not None:
                valid_smiles.append(smiles)
                valid_indices.append(i)
            else:
                logger.warning(f"Invalid SMILES at index {i}: {smiles}")
        
        return valid_smiles, valid_indices
    
    def calculate_descriptors(self, smiles_list):
        """Calculate molecular descriptors for valid SMILES"""
        descriptors = []
        
        for smiles in smiles_list:
            mol = Chem.MolFromSmiles(smiles)
            if mol is not None:
                desc_values = [
                    Descriptors.MolWt(mol),
                    Descriptors.MolLogP(mol),
                    Descriptors.NumHDonors(mol),
                    Descriptors.NumHAcceptors(mol),
                    Descriptors.TPSA(mol),
                    Descriptors.NumRotatableBonds(mol),
                    Descriptors.NumAromaticRings(mol)
                ]
                descriptors.append(desc_values)
        
        return np.array(descriptors)
    
    def normalize_features(self, X):
        """Normalize features using z-score normalization"""
        mean = np.mean(X, axis=0)
        std = np.std(X, axis=0)
        return (X - mean) / std, mean, std

def main():
    """Main preprocessing pipeline"""
    processor = MolecularDataProcessor()
    
    # Example usage
    sample_smiles = [
        'CCO',  # Ethanol
        'CC(=O)O',  # Acetic acid
        'c1ccccc1',  # Benzene
        'invalid_smiles'  # Invalid example
    ]
    
    # Validate SMILES
    valid_smiles, valid_indices = processor.validate_smiles(sample_smiles)
    logger.info(f"Valid SMILES: {len(valid_smiles)}/{len(sample_smiles)}")
    
    # Calculate descriptors
    descriptors = processor.calculate_descriptors(valid_smiles)
    logger.info(f"Calculated descriptors shape: {descriptors.shape}")
    
    # Normalize features
    normalized_features, mean, std = processor.normalize_features(descriptors)
    logger.info("Feature normalization completed")
    
    return normalized_features, mean, std

if __name__ == "__main__":
    main()
