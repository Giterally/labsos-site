# Results Analysis Script for Drug Discovery ML Pipeline
# Author: Research Team
# Date: 2024

# Load required libraries
library(ggplot2)
library(dplyr)
library(corrplot)
library(pROC)
library(caret)
library(randomForest)

# Set working directory and load data
setwd(".")
results_data <- read.csv("model_results.csv", stringsAsFactors = FALSE)

# Function to create performance plots
create_performance_plots <- function(data) {
  # Accuracy comparison
  p1 <- ggplot(data, aes(x = Model, y = Accuracy, fill = Model)) +
    geom_bar(stat = "identity") +
    geom_text(aes(label = round(Accuracy, 3)), vjust = -0.5) +
    labs(title = "Model Accuracy Comparison",
         x = "Model", y = "Accuracy") +
    theme_minimal() +
    theme(legend.position = "none")
  
  # F1 Score comparison
  p2 <- ggplot(data, aes(x = Model, y = F1_Score, fill = Model)) +
    geom_bar(stat = "identity") +
    geom_text(aes(label = round(F1_Score, 3)), vjust = -0.5) +
    labs(title = "Model F1 Score Comparison",
         x = "Model", y = "F1 Score") +
    theme_minimal() +
    theme(legend.position = "none")
  
  # Cross-validation scores
  p3 <- ggplot(data, aes(x = Model, y = CV_Mean, fill = Model)) +
    geom_bar(stat = "identity") +
    geom_errorbar(aes(ymin = CV_Mean - CV_Std, ymax = CV_Mean + CV_Std),
                  width = 0.2) +
    geom_text(aes(label = round(CV_Mean, 3)), vjust = -0.5) +
    labs(title = "Cross-Validation Performance",
         x = "Model", y = "CV Score") +
    theme_minimal() +
    theme(legend.position = "none")
  
  return(list(accuracy = p1, f1 = p2, cv = p3))
}

# Function to analyze feature importance
analyze_feature_importance <- function(model, feature_names) {
  if ("randomForest" %in% class(model)) {
    importance <- importance(model)
    feature_imp <- data.frame(
      Feature = feature_names,
      Importance = importance[, "MeanDecreaseGini"]
    )
    
    # Plot feature importance
    p <- ggplot(feature_imp, aes(x = reorder(Feature, Importance), y = Importance)) +
      geom_bar(stat = "identity", fill = "steelblue") +
      coord_flip() +
      labs(title = "Feature Importance (Random Forest)",
           x = "Features", y = "Importance") +
      theme_minimal()
    
    return(list(data = feature_imp, plot = p))
  }
  return(NULL)
}

# Function to create ROC curves
create_roc_curves <- function(predictions, actual, model_names) {
  roc_data <- data.frame()
  
  for (i in 1:length(predictions)) {
    roc_obj <- roc(actual, predictions[[i]])
    roc_df <- data.frame(
      Model = model_names[i],
      Specificity = 1 - roc_obj$specificities,
      Sensitivity = roc_obj$sensitivities,
      AUC = as.numeric(auc(roc_obj))
    )
    roc_data <- rbind(roc_data, roc_df)
  }
  
  # Plot ROC curves
  p <- ggplot(roc_data, aes(x = Specificity, y = Sensitivity, color = Model)) +
    geom_line(size = 1) +
    geom_abline(intercept = 0, slope = 1, linetype = "dashed", color = "gray") +
    labs(title = "ROC Curves Comparison",
         x = "1 - Specificity", y = "Sensitivity") +
    theme_minimal() +
    theme(legend.position = "bottom")
  
  return(list(data = roc_data, plot = p))
}

# Function to generate summary statistics
generate_summary_stats <- function(data) {
  summary_stats <- data %>%
    summarise(
      Mean_Accuracy = mean(Accuracy, na.rm = TRUE),
      SD_Accuracy = sd(Accuracy, na.rm = TRUE),
      Mean_F1 = mean(F1_Score, na.rm = TRUE),
      SD_F1 = sd(F1_Score, na.rm = TRUE),
      Best_Model = Model[which.max(Accuracy)],
      Best_Accuracy = max(Accuracy, na.rm = TRUE)
    )
  
  return(summary_stats)
}

# Function to create correlation matrix
create_correlation_matrix <- function(data) {
  numeric_cols <- sapply(data, is.numeric)
  corr_data <- data[, numeric_cols]
  
  # Calculate correlation matrix
  corr_matrix <- cor(corr_data, use = "complete.obs")
  
  # Create correlation plot
  p <- corrplot(corr_matrix, method = "color", type = "upper",
                order = "hclust", tl.cex = 0.8, tl.col = "black")
  
  return(list(matrix = corr_matrix, plot = p))
}

# Main analysis function
main_analysis <- function() {
  cat("Starting results analysis...\n")
  
  # Create performance plots
  cat("Creating performance plots...\n")
  plots <- create_performance_plots(results_data)
  
  # Save plots
  ggsave("accuracy_comparison.png", plots$accuracy, width = 10, height = 6)
  ggsave("f1_comparison.png", plots$f1, width = 10, height = 6)
  ggsave("cv_performance.png", plots$cv, width = 10, height = 6)
  
  # Generate summary statistics
  cat("Generating summary statistics...\n")
  summary_stats <- generate_summary_stats(results_data)
  print(summary_stats)
  
  # Create correlation matrix
  cat("Creating correlation matrix...\n")
  corr_results <- create_correlation_matrix(results_data)
  
  # Save correlation plot
  png("correlation_matrix.png", width = 800, height = 800)
  corrplot(corr_results$matrix, method = "color", type = "upper",
           order = "hclust", tl.cex = 0.8, tl.col = "black")
  dev.off()
  
  cat("Analysis complete! Check generated plots and statistics.\n")
  
  return(list(
    plots = plots,
    summary = summary_stats,
    correlation = corr_results
  ))
}

# Run analysis if script is executed directly
if (!interactive()) {
  results <- main_analysis()
}
