#!/usr/bin/env python3

import boto3
import argparse
import json
import csv
import os
from datetime import datetime, timedelta
from tabulate import tabulate

def get_ec2_ri_recommendations():
    """Get EC2 Reserved Instance recommendations from AWS Cost Explorer"""
    ce = boto3.client('ce')
    
    response = ce.get_reservation_purchase_recommendation(
        Service='Amazon Elastic Compute Cloud - Compute',
        LookbackPeriodInDays='SIXTY_DAYS',
        TermInYears='ONE_YEAR',
        PaymentOption='NO_UPFRONT'
    )
    
    return response['Recommendations']

def get_rds_ri_recommendations():
    """Get RDS Reserved Instance recommendations from AWS Cost Explorer"""
    ce = boto3.client('ce')
    
    response = ce.get_reservation_purchase_recommendation(
        Service='Amazon Relational Database Service',
        LookbackPeriodInDays='SIXTY_DAYS',
        TermInYears='ONE_YEAR',
        PaymentOption='NO_UPFRONT'
    )
    
    return response['Recommendations']

def get_elasticache_ri_recommendations():
    """Get ElastiCache Reserved Instance recommendations from AWS Cost Explorer"""
    ce = boto3.client('ce')
    
    response = ce.get_reservation_purchase_recommendation(
        Service='Amazon ElastiCache',
        LookbackPeriodInDays='SIXTY_DAYS',
        TermInYears='ONE_YEAR',
        PaymentOption='NO_UPFRONT'
    )
    
    return response['Recommendations']

def get_opensearch_ri_recommendations():
    """Get OpenSearch Reserved Instance recommendations from AWS Cost Explorer"""
    ce = boto3.client('ce')
    
    response = ce.get_reservation_purchase_recommendation(
        Service='Amazon OpenSearch Service',
        LookbackPeriodInDays='SIXTY_DAYS',
        TermInYears='ONE_YEAR',
        PaymentOption='NO_UPFRONT'
    )
    
    return response['Recommendations']

def get_savings_plans_recommendations():
    """Get Savings Plans recommendations from AWS Cost Explorer"""
    ce = boto3.client('ce')
    
    response = ce.get_savings_plans_purchase_recommendation(
        LookbackPeriodInDays='SIXTY_DAYS',
        TermInYears='ONE_YEAR',
        PaymentOption='NO_UPFRONT',
        SavingsPlansType='COMPUTE_SP'
    )
    
    return response['SavingsPlansPurchaseRecommendation']['SavingsPlansPurchaseRecommendationDetails']

def format_recommendations(recommendations, service):
    """Format recommendations for display"""
    formatted_recommendations = []
    
    for recommendation in recommendations:
        for detail in recommendation['RecommendationDetails']:
            formatted_recommendation = {
                'Service': service,
                'Instance Type': detail['InstanceDetails'].get('EC2InstanceDetails', {}).get('InstanceType') or
                               detail['InstanceDetails'].get('RDSInstanceDetails', {}).get('InstanceType') or
                               detail['InstanceDetails'].get('ElastiCacheInstanceDetails', {}).get('NodeType') or
                               detail['InstanceDetails'].get('ESInstanceDetails', {}).get('InstanceType') or
                               'N/A',
                'Recommended Quantity': detail['RecommendedNumberOfInstancesToPurchase'],
                'Estimated Monthly Savings': f"${detail['EstimatedMonthlySavingsAmount']:.2f}",
                'Estimated Savings Percentage': f"{detail['EstimatedSavingsPercentage']:.2f}%",
                'Upfront Cost': f"${detail['UpfrontCost']:.2f}",
                'Estimated Break Even (Months)': f"{float(detail['UpfrontCost']) / float(detail['EstimatedMonthlySavingsAmount']):.1f}" if float(detail['EstimatedMonthlySavingsAmount']) > 0 else 'N/A',
                'Current On-Demand Spend': f"${detail['CurrentOnDemandSpend']:.2f}",
                'Estimated RI Spend': f"${detail['EstimatedReservationCost']:.2f}"
            }
            formatted_recommendations.append(formatted_recommendation)
    
    return formatted_recommendations

def format_savings_plans_recommendations(recommendations):
    """Format Savings Plans recommendations for display"""
    formatted_recommendations = []
    
    for detail in recommendations:
        formatted_recommendation = {
            'Service': 'Compute Savings Plan',
            'Instance Type': 'N/A',
            'Recommended Commitment': f"${detail['HourlyCommitment']:.2f}/hour",
            'Estimated Monthly Savings': f"${detail['EstimatedMonthlySavingsAmount']:.2f}",
            'Estimated Savings Percentage': f"{detail['EstimatedSavingsPercentage']:.2f}%",
            'Upfront Cost': f"${detail['UpfrontCost']:.2f}",
            'Estimated Break Even (Months)': f"{float(detail['UpfrontCost']) / float(detail['EstimatedMonthlySavingsAmount']):.1f}" if float(detail['EstimatedMonthlySavingsAmount']) > 0 else 'N/A',
            'Current On-Demand Spend': f"${detail['CurrentOnDemandSpend']:.2f}",
            'Estimated SP Spend': f"${detail['EstimatedSPCost']:.2f}"
        }
        formatted_recommendations.append(formatted_recommendation)
    
    return formatted_recommendations

def save_to_json(recommendations, filename):
    """Save recommendations to JSON file"""
    with open(filename, 'w') as f:
        json.dump(recommendations, f, indent=2)
    
    print(f"Recommendations saved to {filename}")

def save_to_csv(recommendations, filename):
    """Save recommendations to CSV file"""
    if not recommendations:
        print("No recommendations to save")
        return
    
    with open(filename, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=recommendations[0].keys())
        writer.writeheader()
        writer.writerows(recommendations)
    
    print(f"Recommendations saved to {filename}")

def display_recommendations(recommendations):
    """Display recommendations in a table"""
    if not recommendations:
        print("No recommendations available")
        return
    
    print(tabulate(recommendations, headers='keys', tablefmt='grid'))

def main():
    parser = argparse.ArgumentParser(description='Generate Reserved Instance and Savings Plans recommendations')
    parser.add_argument('--output-dir', default='.', help='Directory to save output files')
    parser.add_argument('--format', choices=['json', 'csv', 'table'], default='table', help='Output format')
    args = parser.parse_args()
    
    # Create output directory if it doesn't exist
    os.makedirs(args.output_dir, exist_ok=True)
    
    # Get current date for filenames
    current_date = datetime.now().strftime('%Y-%m-%d')
    
    # Get recommendations
    print("Fetching EC2 Reserved Instance recommendations...")
    ec2_recommendations = get_ec2_ri_recommendations()
    formatted_ec2_recommendations = format_recommendations(ec2_recommendations, 'EC2')
    
    print("Fetching RDS Reserved Instance recommendations...")
    rds_recommendations = get_rds_ri_recommendations()
    formatted_rds_recommendations = format_recommendations(rds_recommendations, 'RDS')
    
    print("Fetching ElastiCache Reserved Instance recommendations...")
    elasticache_recommendations = get_elasticache_ri_recommendations()
    formatted_elasticache_recommendations = format_recommendations(elasticache_recommendations, 'ElastiCache')
    
    print("Fetching OpenSearch Reserved Instance recommendations...")
    opensearch_recommendations = get_opensearch_ri_recommendations()
    formatted_opensearch_recommendations = format_recommendations(opensearch_recommendations, 'OpenSearch')
    
    print("Fetching Savings Plans recommendations...")
    savings_plans_recommendations = get_savings_plans_recommendations()
    formatted_savings_plans_recommendations = format_savings_plans_recommendations(savings_plans_recommendations)
    
    # Combine all recommendations
    all_recommendations = (
        formatted_ec2_recommendations +
        formatted_rds_recommendations +
        formatted_elasticache_recommendations +
        formatted_opensearch_recommendations +
        formatted_savings_plans_recommendations
    )
    
    # Sort recommendations by estimated monthly savings (descending)
    all_recommendations.sort(key=lambda x: float(x['Estimated Monthly Savings'].replace('$', '')), reverse=True)
    
    # Output recommendations
    if args.format == 'json':
        save_to_json(all_recommendations, os.path.join(args.output_dir, f'ri-recommendations-{current_date}.json'))
    elif args.format == 'csv':
        save_to_csv(all_recommendations, os.path.join(args.output_dir, f'ri-recommendations-{current_date}.csv'))
    else:
        display_recommendations(all_recommendations)
    
    # Calculate total potential savings
    total_monthly_savings = sum(float(rec['Estimated Monthly Savings'].replace('$', '')) for rec in all_recommendations)
    total_upfront_cost = sum(float(rec['Upfront Cost'].replace('$', '')) for rec in all_recommendations)
    
    print(f"\nTotal potential monthly savings: ${total_monthly_savings:.2f}")
    print(f"Total upfront cost: ${total_upfront_cost:.2f}")
    print(f"Estimated payback period: {total_upfront_cost / total_monthly_savings:.1f} months")
    print(f"Estimated annual savings: ${total_monthly_savings * 12:.2f}")

if __name__ == '__main__':
    main()
