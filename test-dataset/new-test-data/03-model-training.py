#!/usr/bin/env python3
"""
Machine Learning Model Training Pipeline

This script implements various ML models for drug activity prediction:
- Random Forest
- Support Vector Machine
- Neural Network
- Gradient Boosting
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.svm import SVC
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
import joblib
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DrugActivityPredictor:
    """ML pipeline for drug activity prediction"""
    
    def __init__(self):
        self.models = {
            'random_forest': RandomForestClassifier(n_estimators=100, random_state=42),
            'svm': SVC(kernel='rbf', random_state=42),
            'neural_network': MLPClassifier(hidden_layer_sizes=(100, 50), random_state=42),
            'gradient_boosting': GradientBoostingClassifier(random_state=42)
        }
        self.trained_models = {}
        self.model_scores = {}
    
    def train_models(self, X, y):
        """Train all models and evaluate performance"""
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        
        for name, model in self.models.items():
            logger.info(f"Training {name}...")
            
            # Train model
            model.fit(X_train, y_train)
            
            # Make predictions
            y_pred = model.predict(X_test)
            
            # Calculate metrics
            accuracy = accuracy_score(y_test, y_pred)
            precision = precision_score(y_test, y_pred, average='weighted')
            recall = recall_score(y_test, y_pred, average='weighted')
            f1 = f1_score(y_test, y_pred, average='weighted')
            
            # Cross-validation
            cv_scores = cross_val_score(model, X_train, y_train, cv=5)
            
            # Store results
            self.trained_models[name] = model
            self.model_scores[name] = {
                'accuracy': accuracy,
                'precision': precision,
                'recall': recall,
                'f1': f1,
                'cv_mean': cv_scores.mean(),
                'cv_std': cv_scores.std()
            }
            
            logger.info(f"{name} - Accuracy: {accuracy:.3f}, CV: {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")
    
    def get_best_model(self):
        """Return the best performing model based on F1 score"""
        best_model_name = max(self.model_scores.keys(), 
                            key=lambda x: self.model_scores[x]['f1'])
        return best_model_name, self.trained_models[best_model_name]
    
    def save_models(self, output_dir='models'):
        """Save trained models to disk"""
        import os
        os.makedirs(output_dir, exist_ok=True)
        
        for name, model in self.trained_models.items():
            filename = f"{output_dir}/{name}_model.pkl"
            joblib.dump(model, filename)
            logger.info(f"Saved {name} model to {filename}")
    
    def generate_report(self):
        """Generate a performance report"""
        report = []
        report.append("Model Performance Report")
        report.append("=" * 50)
        
        for name, scores in self.model_scores.items():
            report.append(f"\n{name.upper()}:")
            report.append(f"  Accuracy:  {scores['accuracy']:.3f}")
            report.append(f"  Precision: {scores['precision']:.3f}")
            report.append(f"  Recall:    {scores['recall']:.3f}")
            report.append(f"  F1 Score:  {scores['f1']:.3f}")
            report.append(f"  CV Score:  {scores['cv_mean']:.3f} ± {scores['cv_std']:.3f}")
        
        return "\n".join(report)

def main():
    """Main training pipeline"""
    # Generate synthetic data for demonstration
    np.random.seed(42)
    n_samples = 1000
    n_features = 7
    
    X = np.random.randn(n_samples, n_features)
    y = np.random.randint(0, 2, n_samples)  # Binary classification
    
    logger.info(f"Training data shape: {X.shape}")
    logger.info(f"Target distribution: {np.bincount(y)}")
    
    # Initialize predictor
    predictor = DrugActivityPredictor()
    
    # Train models
    predictor.train_models(X, y)
    
    # Get best model
    best_name, best_model = predictor.get_best_model()
    logger.info(f"Best model: {best_name}")
    
    # Save models
    predictor.save_models()
    
    # Generate report
    report = predictor.generate_report()
    print(report)
    
    return predictor

if __name__ == "__main__":
    main()
